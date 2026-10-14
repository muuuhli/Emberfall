#!/usr/bin/env bash
# Operator entry point. Never source .env files or enable shell tracing here.
set -Eeuo pipefail
umask 077

repo_dir=/srv/emberfall/repo
release_root=/srv/emberfall/releases
backup_root=/srv/emberfall/backups
env_file=/srv/emberfall/.env.ip
current_link=''
source_marker=''
revision=main
usage() {
  cat <<'EOF'
Usage: update-from-git.sh [main|FULL_40_CHARACTER_COMMIT] [options]
  --repo-dir PATH      Git cache (default /srv/emberfall/repo)
  --release-root PATH  Immutable releases (default /srv/emberfall/releases)
  --backup-root PATH   Private snapshots (default /srv/emberfall/backups)
  --env-file PATH      Existing operator config (default /srv/emberfall/.env.ip)
  --current-link PATH  Release symlink (default current beside the env file)
  --source-marker PATH SHA file (default DEPLOYED_SOURCE beside the env file)

Fetches muuuhli/Emberfall, builds the pinned release, backs up the stopped game,
checks save compatibility, and replaces only the Emberfall application/proxy.
Requires Bash, Git, Docker Compose with --wait, curl, Python 3, tar and flock.
EOF
}
die() { printf 'Emberfall: %s\n' "$*" >&2; exit 1; }
while (($#)); do
  case "$1" in
    --repo-dir|--release-root|--backup-root|--env-file|--current-link|--source-marker)
      (($#>=2))||die "Missing path for $1"
      case "$1" in --repo-dir) repo_dir=$2;; --release-root) release_root=$2;; --backup-root) backup_root=$2;; --env-file) env_file=$2;; --current-link) current_link=$2;; --source-marker) source_marker=$2;; esac
      shift 2;;
    -h|--help) usage; exit 0;;
    main|[0-9a-fA-F]*) [[ "$1" == main || "$1" =~ ^[0-9a-fA-F]{40}$ ]]||die 'Use main or a full commit SHA.';revision=$(printf '%s' "$1" | tr 'A-F' 'a-f');shift;;
    *) die 'Unknown argument. Use --help.';;
  esac
done
for tool in git docker curl python3 tar flock tr awk cmp date; do command -v "$tool" >/dev/null||die "Required command unavailable: $tool"; done
for directory in "$repo_dir" "$release_root" "$backup_root"; do [[ "$directory" == /* && "$directory" != / && ! -L "$directory" ]]||die 'Use absolute, non-symlink private directories.'; done
[[ "$env_file" == /* && -f "$env_file" && ! -L "$env_file" ]]||die 'The existing operator .env file must be an absolute regular file.'
[[ "$current_link" ]]||current_link=$(dirname "$env_file")/current
[[ "$source_marker" ]]||source_marker=$(dirname "$env_file")/DEPLOYED_SOURCE
for file in "$current_link" "$source_marker"; do
  [[ "$file" == /* && "$file" != "$env_file" ]]||die 'Metadata needs distinct absolute paths outside the operator environment.'
  case "$file/" in "$repo_dir/"*|"$release_root/"*) die 'Keep source markers outside Git and immutable release directories.';; esac
done
[[ "$current_link" != "$source_marker" ]]||die 'The release symlink and SHA marker must have distinct paths.'
case "$env_file/" in "$repo_dir/"*|"$release_root/"*) die 'Keep the operator environment outside Git and source releases.';; esac
case "$backup_root/" in "$repo_dir/"*|"$release_root/"*) die 'Keep private backups outside Git and source releases.';; esac
mkdir -p "$release_root" "$backup_root"
chmod 700 "$backup_root"
exec 9>"$release_root/.update.lock"
flock -n 9||die 'Another Emberfall update is running.'

stage=''; config_file=''; backup_dir=''; old_release=''; target=''; stopped=0; switched=0; metadata_touched=0
compose() {
  local commit=$1;shift
  EMBERFALL_RELEASE="$commit" docker compose --project-name emberfall --env-file "$env_file" \
    -f "$release_root/$commit/deploy/compose.ip.yaml" \
    -f "$release_root/$commit/deploy/compose.account.yaml" "$@"
}
atomic_env() {
  python3 - "$env_file" "$1" <<'PY'
import os, pathlib, sys, tempfile
destination=pathlib.Path(sys.argv[1]); revision=sys.argv[2]
lines=destination.read_text().splitlines(keepends=True)
count=sum(line.startswith('EMBERFALL_RELEASE=') for line in lines)
if count!=1: raise SystemExit('Expected exactly one EMBERFALL_RELEASE setting.')
contents=''.join(f'EMBERFALL_RELEASE={revision}\n' if line.startswith('EMBERFALL_RELEASE=') else line for line in lines).encode()
fd,name=tempfile.mkstemp(prefix='.emberfall-env-',dir=destination.parent)
try:
    os.fchmod(fd,0o600)
    with os.fdopen(fd,'wb') as output: output.write(contents);output.flush();os.fsync(output.fileno())
    os.replace(name,destination)
finally:
    if os.path.exists(name): os.unlink(name)
PY
}
restore_env() {
  # A same-directory temporary file keeps the replacement atomic.
  local temp
  temp=$(mktemp "$(dirname "$env_file")/.emberfall-env-XXXXXXXX")
  cp "$backup_dir/operator.env" "$temp";chmod 600 "$temp";mv "$temp" "$env_file"
}
source_metadata() {
  python3 - "$1" "$current_link" "$source_marker" "$release_root" "$old_release" "$target" "$backup_dir" <<'PY'
import json,os,pathlib,stat,sys,tempfile,uuid
action=sys.argv[1];link,marker,root=map(pathlib.Path,sys.argv[2:5]);previous,current=sys.argv[5:7];backup=pathlib.Path(sys.argv[7])/'source-metadata.json'
def state(path,kind):
    if path.is_symlink():
        if kind!='link': raise SystemExit('The SHA marker must not be a symbolic link.')
        return {'kind':'link','target':os.readlink(path)}
    if not path.exists(): return {'kind':'absent'}
    if kind=='link' or not path.is_file(): raise SystemExit('Source metadata has an unexpected file type; it was preserved.')
    return {'kind':'file','text':path.read_text(),'mode':stat.S_IMODE(path.stat().st_mode)}
def read(): return {'link':state(link,'link'),'marker':state(marker,'file')}
def check(value):
    if value['link']['kind']=='link' and (link.parent/value['link']['target']).resolve()!=(root/previous).resolve(): raise SystemExit('Current source symlink differs from the running release; it was preserved.')
    if value['marker']['kind']=='file' and value['marker']['text'].strip()!=previous: raise SystemExit('Deployed source marker differs from the running release; it was preserved.')
def replace(path,value):
    if value['kind']=='absent':
        if os.path.lexists(path): path.unlink()
        return
    name=None
    try:
        if value['kind']=='link':
            name=str(path.parent/('.emberfall-current-'+uuid.uuid4().hex));os.symlink(value['target'],name)
        else:
            fd,name=tempfile.mkstemp(prefix='.emberfall-source-',dir=path.parent);os.fchmod(fd,value.get('mode',0o600))
            with os.fdopen(fd,'w') as output: output.write(value['text']);output.flush();os.fsync(output.fileno())
        os.replace(name,path)
    finally:
        if name and os.path.lexists(name): os.unlink(name)
if action in {'check','snapshot'}:
    value=read();check(value)
    if not link.parent.is_dir() or not marker.parent.is_dir(): raise SystemExit('Source metadata directories must already exist.')
    if action=='snapshot': backup.write_text(json.dumps(value));backup.chmod(0o600)
elif action=='publish':
    saved=json.loads(backup.read_text())
    if read()!=saved: raise SystemExit('Source metadata changed during the update; it was preserved.')
    replace(link,{'kind':'link','target':str(root/current)})
    replace(marker,{'kind':'file','text':current+'\n','mode':0o600})
elif action=='restore':
    saved=json.loads(backup.read_text());value=read()
    # Restore only our publication, leaving foreign edits untouched.
    if value['link']!=saved['link']:
        if value['link']!={'kind':'link','target':str(root/current)}: raise SystemExit('Foreign source symlink was preserved during recovery.')
        replace(link,saved['link'])
    if value['marker']!=saved['marker']:
        if value['marker']['kind']!='file' or value['marker']['text']!=current+'\n': raise SystemExit('Foreign source marker was preserved during recovery.')
        replace(marker,saved['marker'])
else: raise SystemExit('Unknown source metadata action.')
PY
}
recover() {
  local code=$?
  trap - EXIT INT TERM
  if ((code!=0&&stopped)); then
    printf 'Emberfall update failed; recovering the previous release.\n' >&2
    if ((switched)); then
      # Preserve both sides before restoring a pre-update schema.
      compose "$target" stop emberfall >/dev/null 2>&1||true
      compose "$target" cp emberfall:/data/rooms.json "$backup_dir/failed-state.json" >/dev/null 2>&1||true
      [[ ! -f "$backup_dir/failed-state.json" ]]||chmod 600 "$backup_dir/failed-state.json"
      if restore_env && compose "$old_release" run --rm -T --no-deps --entrypoint node emberfall -e '
        const fs=require("node:fs"),crypto=require("node:crypto"),bytes=fs.readFileSync(0);
        JSON.parse(bytes.toString("utf8"));
        const file="/data/.restore-"+crypto.randomUUID();
        fs.writeFileSync(file,bytes,{mode:0o600,flag:"wx"});fs.renameSync(file,"/data/rooms.json");
      ' < "$backup_dir/rooms.json" && compose "$old_release" up -d --no-build --wait --wait-timeout 90 emberfall emberfall-https && { ((metadata_touched==0)) || source_metadata restore; }; then
        printf 'Previous release restored with its matching private backup.\n' >&2
      else
        printf 'Recovery needs operator attention. Private snapshots are retained; do not start older code with upgraded data.\n' >&2
      fi
    else
      compose "$old_release" start emberfall >/dev/null 2>&1||printf 'Restart the previous Emberfall service; the configuration was not switched.\n' >&2
    fi
  fi
  [[ ! "$stage" || ! -d "$stage" ]]||rm -rf -- "$stage"
  [[ ! "$config_file" || ! -f "$config_file" ]]||rm -f -- "$config_file"
  exit "$code"
}
trap recover EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Read only static operator values; compose remains responsible for its full file.
operator=()
while IFS= read -r value; do operator+=("$value");done < <(python3 - "$env_file" <<'PY'
import ipaddress,pathlib,re,sys
values={}
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    if not line.strip() or line.lstrip().startswith('#'): continue
    match=re.fullmatch(r'([A-Z][A-Z0-9_]*)=(.*)',line)
    if not match: raise SystemExit('Operator config needs ordinary KEY=value lines.')
    key,value=match.groups()
    if key in values: raise SystemExit('Duplicate operator setting.')
    value=value.strip()
    if len(value)>=2 and value[0]==value[-1] and value[0] in "'\"": value=value[1:-1]
    values[key]=value
release=values.get('EMBERFALL_RELEASE','')
if not re.fullmatch('[0-9a-f]{40}',release): raise SystemExit('Existing release must have a full commit SHA.')
address=ipaddress.ip_address(values.get('EMBERFALL_IP',''))
port=int(values.get('EMBERFALL_TLS_PORT','9443'))
if not 1<=port<=65535: raise SystemExit('Invalid HTTPS port.')
host=f'[{address}]' if address.version==6 else str(address)
print(release);print(f'https://{host}:{port}');print(values.get('EMBERFALL_MAX_ACCOUNTS','32'));print(values.get('EMBERFALL_MAX_ROOMS','8'))
PY
)
((${#operator[@]}==4))||die 'Could not read the existing account/TLS configuration.'
old_release=${operator[0]}; secure_origin=${operator[1]}
source_metadata check
[[ -f "$release_root/$old_release/deploy/compose.ip.yaml" && -f "$release_root/$old_release/deploy/compose.account.yaml" ]]||die 'The running source release is missing. Preserve it before updating.'
compose_help=$(docker compose up --help)
[[ "$compose_help" == *'--wait'* ]]||die 'Docker Compose with up --wait is required.'
container=$(compose "$old_release" ps -q emberfall)
[[ "$container" && "$container" != *$'\n'* ]]||die 'Exactly one existing Emberfall service is required.'
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container") == emberfall ]]||die 'The container belongs to another project.'
[[ $(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$container") == emberfall_data ]]||die 'The existing data volume is not emberfall_data.'
[[ $(docker inspect --format '{{.Config.Image}}' "$container") == "emberfall:$old_release" ]]||die 'The running image and operator release setting differ.'

if [[ ! -e "$repo_dir" ]]; then
  GIT_TERMINAL_PROMPT=0 git clone --no-checkout --origin origin https://github.com/muuuhli/Emberfall.git "$repo_dir"
fi
[[ $(git -C "$repo_dir" rev-parse --is-bare-repository) == false ]]||die 'Use a dedicated ordinary Git clone.'
remote=$(git -C "$repo_dir" remote get-url origin)
case "$remote" in
  https://github.com/muuuhli/Emberfall|https://github.com/muuuhli/Emberfall.git|git@github.com:muuuhli/Emberfall.git|ssh://git@github.com/muuuhli/Emberfall.git) ;;
  *) die 'origin must identify muuuhli/Emberfall without URL credentials.';;
esac
# No reset, checkout, clean, forced fetch, or credentials are written to the cache.
GIT_TERMINAL_PROMPT=0 git -C "$repo_dir" fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
if [[ "$revision" == main ]]; then target=$(git -C "$repo_dir" rev-parse 'refs/remotes/origin/main^{commit}');else target=$revision;fi
[[ "$target" =~ ^[0-9a-f]{40}$ ]]||die 'The selected commit is invalid.'
git -C "$repo_dir" cat-file -e "$target^{commit}"
git -C "$repo_dir" merge-base --is-ancestor "$target" refs/remotes/origin/main||die 'The selected commit is not on fetched origin/main.'
git -C "$repo_dir" merge-base --is-ancestor "$old_release" "$target"||die 'Only forward updates are supported. A rollback needs its matching pre-update backup.'
git -C "$repo_dir" ls-tree -r "$target" | awk '$1 != "100644" && $1 != "100755" {bad=1} END {exit bad}'||die 'Submodules and symbolic links are not supported in releases.'
stage=$(mktemp -d "$release_root/.prepare-XXXXXXXX")
git -C "$repo_dir" archive --format=tar "$target" | tar -xf - -C "$stage"
[[ -f "$stage/server/accounts.mjs" && -f "$stage/deploy/compose.account.yaml" ]]||die 'The release must retain account support. Older schemas need an explicit backup restore.'
python3 - "$stage" "$release_root/$target" <<'PY'
import hashlib,pathlib,sys
source,target=map(pathlib.Path,sys.argv[1:])
def contents(root):
    result={}
    for file in root.rglob('*'):
        if file.is_symlink(): raise SystemExit('Symbolic links are not allowed in a release.')
        if not file.is_file(): continue
        relative=file.relative_to(root).as_posix()
        if any(part in {'.git','.emberfall-server','node_modules'} for part in file.relative_to(root).parts): raise SystemExit('Runtime or Git data in release.')
        if file.name.startswith('.env') and not file.name.endswith('.example'): raise SystemExit('Private environment file in source archive.')
        result[relative]=hashlib.sha256(file.read_bytes()).hexdigest()
    return result
expected=contents(source)
if target.exists() and (not target.is_dir() or contents(target)!=expected): raise SystemExit('Existing release differs from Git; it was preserved without overwrite.')
PY
if [[ -d "$release_root/$target" ]]; then rm -rf -- "$stage";stage='';else mv "$stage" "$release_root/$target";stage='';fi
release_dir=$release_root/$target
compose "$target" config --quiet
config_file=$(mktemp "$backup_root/.compose-check-XXXXXXXX")
compose "$target" config --format json > "$config_file"
python3 - "$config_file" "$target" "$secure_origin" <<'PY'
import json,pathlib,sys
value=json.loads(pathlib.Path(sys.argv[1]).read_text());service=value['services']['emberfall'];environment=service.get('environment',{})
mounts=[mount for mount in service.get('volumes',[]) if mount.get('target')=='/data']
if service.get('image')!='emberfall:'+sys.argv[2] or len(mounts)!=1 or mounts[0].get('source')!='emberfall_data' or value['volumes']['emberfall_data'].get('name')!='emberfall_data': raise SystemExit('Compose must retain the pinned image and emberfall_data volume.')
if str(environment.get('EMBERFALL_AUTH_REQUIRE_HTTPS'))!='1' or str(environment.get('EMBERFALL_AUTH_COOKIE_SECURE'))!='1' or environment.get('EMBERFALL_SECURE_ORIGIN')!=sys.argv[3]: raise SystemExit('Compose must retain secure account transport.')
if 'emberfall-https' not in value['services']: raise SystemExit('The existing HTTPS service must be retained.')
PY
rm "$config_file"
config_file=''
printf 'Pinned Git release: %s\n' "$target"
# Build the exact archive while the previous authority continues running.
docker build --label "org.opencontainers.image.revision=$target" --tag "emberfall:$target" "$release_dir"
[[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "emberfall:$target") == "$target" ]]||die 'The image revision label does not match the selected commit.'

backup_dir=$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
source_metadata snapshot
cp "$env_file" "$backup_dir/operator.env";chmod 600 "$backup_dir/operator.env"
printf '%s\n' "$old_release" > "$backup_dir/release-before.txt"
printf '%s\n' "$target" > "$backup_dir/release-after.txt"
stopped=1
compose "$old_release" stop emberfall
compose "$old_release" cp emberfall:/data/rooms.json "$backup_dir/rooms.json"
chmod 600 "$backup_dir/rooms.json"
# Strict restore in a disposable, networkless process; no production volume.
docker run --rm -i --network none --read-only --tmpfs /tmp --memory 768m --cpus 0.5 \
  --cap-drop ALL --security-opt no-new-privileges:true -e NODE_OPTIONS=--max-old-space-size=384 \
  --entrypoint node "emberfall:$target" --input-type=module -e '
    import fs from "node:fs";import {Game} from "./src/game.js";import {MultiplayerHub} from "./server/multiplayer.mjs";
    const data=JSON.parse(fs.readFileSync(0,"utf8"));
    new MultiplayerHub({createGame:()=>new Game({storage:null}),storage:{load:()=>data,save:()=>{}},autoStart:false,strictRestore:true});
  ' < "$backup_dir/rooms.json"
switched=1
atomic_env "$target"
compose "$target" up -d --no-build --wait --wait-timeout 90 emberfall emberfall-https
running=$(compose "$target" ps -q emberfall)
[[ $(docker inspect --format '{{.Image}}' "$running") == $(docker image inspect --format '{{.Id}}' "emberfall:$target") ]]||die 'The running backend is not the selected image.'
[[ $(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$running") == emberfall_data ]]||die 'The running backend data volume changed.'

# Independent host and container fingerprints cover every shipped runtime file.
expected=$(python3 - "$release_dir" <<'PY'
import hashlib,pathlib,sys
root=pathlib.Path(sys.argv[1]);files=[root/'package.json',root/'index.html',root/'server.mjs']
for folder in ['src','server','assets']: files.extend(file for file in (root/folder).rglob('*') if file.is_file())
digest=hashlib.sha256()
for file in sorted(files,key=lambda f:f.relative_to(root).as_posix().encode()):
    digest.update(file.relative_to(root).as_posix().encode()+b'\0'+hashlib.sha256(file.read_bytes()).hexdigest().encode()+b'\n')
print(digest.hexdigest())
PY
)
actual=$(compose "$target" exec -T emberfall node --input-type=module -e '
  import fs from "node:fs";import path from "node:path";import crypto from "node:crypto";
  const files=["package.json","index.html","server.mjs"],walk=dir=>{for(const name of fs.readdirSync(dir)){const file=path.posix.join(dir,name);if(fs.statSync(file).isDirectory())walk(file);else files.push(file);}};
  for(const dir of ["src","server","assets"])walk(dir);
  const digest=crypto.createHash("sha256");for(const file of files.sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))))digest.update(file+"\0"+crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")+"\n");console.log(digest.digest("hex"));
')
[[ "$actual" == "$expected" ]]||die 'Backend source files differ from the selected Git archive.'
curl --fail --silent --show-error --connect-timeout 5 --max-time 20 --retry 2 --retry-delay 1 --proto '=https' "$secure_origin/healthz" -o "$backup_dir/health.json"
curl --fail --silent --show-error --connect-timeout 5 --max-time 20 --proto '=https' "$secure_origin/api/account" -o "$backup_dir/account-check.json"
python3 - "$backup_dir/account-check.json" "$secure_origin" <<'PY'
import json,pathlib,sys
value=json.loads(pathlib.Path(sys.argv[1]).read_text())
if value.get('requiresHTTPS') is not False or value.get('secureOrigin')!=sys.argv[2]: raise SystemExit('HTTPS account transport differs from the operator configuration.')
PY
for file in index.html src/main.js src/style.css; do
  curl --fail --silent --show-error --connect-timeout 5 --max-time 20 --proto '=https' "$secure_origin/$file" -o "$backup_dir/public-file"
  cmp -s "$release_dir/$file" "$backup_dir/public-file"||die 'Public HTTPS files differ from the running Git release.'
done
rm "$backup_dir/public-file"
metadata_touched=1
source_metadata publish
stopped=0
printf 'Emberfall updated to %s. HTTPS, backend source and persistent volume verified.\n' "$target"
printf 'Private pre-update backup: %s\n' "$backup_dir"
