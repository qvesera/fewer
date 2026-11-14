/**
 * The archive engine, shared by both scripts.
 *
 * A folder can hold archives, and an archive is a real file: an edit to
 * `Logos.zip/Logos/Logo.eps` is `7z rn Logos.zip 'Logos/Logo.eps' …` — the
 * zip is edited in place, next to the folder's other changes.
 *
 * The plan for one archive is a tab-separated file, the same format the
 * Python fallback reads:
 *
 *   MOVE<TAB>from<TAB>to<TAB>temp    phase 1: rename the source aside
 *   COMMIT<TAB>temp<TAB>to           phase 2: put it where it belongs
 *   DELETE<TAB>path
 *   ADDFILE<TAB>path
 *   ADDDIR<TAB>path
 *   ADDCOPY<TAB>src<TAB>dest
 *
 * The Python engine reads the MOVE rows (the plan is a name mapping, so the
 * order does not matter to it) and ignores the COMMIT rows. The 7-Zip engine
 * renames one pair per call, so it needs the two phases: every source is
 * renamed aside to a temporary name first, then each temporary name goes to
 * its destination. That is what makes a swap (A→B, B→A) work.
 */
export const BASH_ARCHIVE_ENGINE = `
ARCHIVE_ENGINE=''
SEVENZIP=''
PYTHON=''

install_7zip() {
  # The command is always shown before it runs, and printed again if it fails,
  # so the user can install 7-Zip themselves and re-run this script.
  local manager=''
  local cmd=''
  if [ "$(uname -s)" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      manager=brew
      cmd='brew install p7zip'
    else
      say 'Install 7-Zip yourself with: brew install p7zip'
      return 1
    fi
  elif command -v apt-get >/dev/null 2>&1; then
    manager=apt
    cmd='sudo apt-get install -y p7zip-full'
  elif command -v dnf >/dev/null 2>&1; then
    manager=dnf
    cmd='sudo dnf install -y p7zip'
  elif command -v pacman >/dev/null 2>&1; then
    manager=pacman
    cmd='sudo pacman -S --noconfirm p7zip'
  elif command -v apk >/dev/null 2>&1; then
    manager=apk
    cmd='sudo apk add p7zip'
  else
    say 'Install 7-Zip with your package manager (p7zip-full on Debian/Ubuntu, p7zip on Fedora/Arch), then run this script again.'
    return 1
  fi
  say "Running: $cmd"
  case "$manager" in
    brew) brew install p7zip ;;
    apt) sudo apt-get install -y p7zip-full ;;
    dnf) sudo dnf install -y p7zip ;;
    pacman) sudo pacman -S --noconfirm p7zip ;;
    apk) sudo apk add p7zip ;;
  esac
  local status=$?
  if [ "$status" = 0 ]; then
    return 0
  fi
  say "That did not work. Install 7-Zip yourself with: $cmd"
  return 1
}
# Pick the engine that edits archives. Called only when the plan really has
# archive work, so a folder without archives never asks about 7-Zip.
archive_engine() {
  [ -n "$ARCHIVE_ENGINE" ] && return 0

  for candidate in 7z 7zz 7za 7zr; do
    if command -v "$candidate" >/dev/null 2>&1; then SEVENZIP="$candidate"; break; fi
  done

  if [ -z "$SEVENZIP" ] && [ "$ASSUME_YES" = 0 ] && [ -t 0 ]; then
    # Offer the install, but only to someone who is there to answer — and only
    # when they can see the command that is about to run.
    printf '\\n7-Zip is not installed. Install it now? [y/N]: '
    read -r reply || reply=''
    case "$reply" in
      y|Y|yes)
        if install_7zip; then
          for candidate in 7z 7zz 7za 7zr; do
            if command -v "$candidate" >/dev/null 2>&1; then SEVENZIP="$candidate"; break; fi
          done
        fi
        ;;
    esac
  fi

  if command -v python3 >/dev/null 2>&1; then PYTHON=python3; fi

  if [ -n "$SEVENZIP" ]; then
    ARCHIVE_ENGINE=7z
    return 0
  fi
  if [ -n "$PYTHON" ]; then
    ARCHIVE_ENGINE=python
    say "7-Zip is not installed — using Python 3 instead."
    cat > "$ARCHIVE_WORK/fewer_zip.py" <<'FEWER_ZIP_PY_EOF'
__PYTHON__
FEWER_ZIP_PY_EOF
    return 0
  fi
  die "nothing here can edit an archive: install 7-Zip (apt install p7zip-full, brew install p7zip) or Python 3, and run this script again."
}
# Apply one archive's plan.
#   $1 = the archive file, $2 = the plan file (tab separated)
apply_archive_plan() {
  local archive="$1"
  local plan="$2"
  local abs
  abs="$(cd "$(dirname -- "$archive")" && pwd)/$(basename -- "$archive")"
  archive_engine

  if [ "$ARCHIVE_ENGINE" = "python" ]; then
    local effective="$plan"
    if [ "$ALLOW_DELETE" = 0 ]; then
      # Deletions were not allowed: drop them, and the renames that would
      # have landed on an entry that is still there. (Pre-deletes free a
      # path for a rename and are part of the rename itself, so they stay.)
      effective="$ARCHIVE_WORK/plan-allowed.tsv"
      awk -F'\t' '$1 == "DELETE" { drop[$2] = 1; next } ($1 == "MOVE" || $1 == "COMMIT") && ($3 in drop) { next } { print }' "$plan" > "$effective"
    fi
    "$PYTHON" "$ARCHIVE_WORK/fewer_zip.py" --apply "$abs" "$effective" ||
      die "Python could not rewrite '$archive' — it is unchanged"
    return 0
  fi

  # A deletion that frees a path for a rename has to happen first: the
  # entry still sits at its old path, before anything is renamed.
  while IFS="	" read -r kind path _; do
    [ "$kind" = "PREDELETE" ] || continue
    say "· inside $archive: delete $path"
    "$SEVENZIP" d -bso0 -bsp0 "$abs" "$path" ||
      die "7-Zip could not delete '$path' inside '$archive' — it is unchanged"
  done < "$plan"

  # Phase 1: every source is renamed aside to a temporary name.
  while IFS="	" read -r kind from to temp; do
    [ "$kind" = "MOVE" ] || continue
    say "· inside $archive: rename $from"
    "$SEVENZIP" rn -bso0 -bsp0 "$abs" "$from" "$temp" ||
      die "7-Zip could not set '$from' aside inside '$archive' — it is unchanged"
  done < "$plan"

  # Phase 2: each temporary name goes to its real destination.
  while IFS="	" read -r kind temp to _; do
    [ "$kind" = "COMMIT" ] || continue
    say "· inside $archive: rename $to"
    "$SEVENZIP" rn -bso0 -bsp0 "$abs" "$temp" "$to" ||
      die "7-Zip could not place '$to' inside '$archive' — it holds the entries as '.fewer-tmp-N'"
  done < "$plan"

  while IFS="	" read -r kind path _; do
    [ "$kind" = "DELETE" ] || continue
    if [ "$ALLOW_DELETE" = 1 ]; then
      say "· inside $archive: delete $path"
      "$SEVENZIP" d -bso0 -bsp0 "$abs" "$path" ||
        die "7-Zip could not delete '$path' inside '$archive'"
    else
      printf '· skipped delete %q inside %q (not allowed)\\n' "$path" "$archive"
    fi
  done < "$plan"

  # New entries are staged in a temp folder that mirrors their paths inside
  # the archive, then added from there.
  local staged=0
  while IFS="	" read -r kind path _; do
    case "$kind" in
      ADDFILE)
        staged=1
        mkdir -p -- "$ARCHIVE_WORK/add/$(dirname -- "$path")"
        : > "$ARCHIVE_WORK/add/$path"
        ;;
      ADDDIR)
        staged=1
        mkdir -p -- "$ARCHIVE_WORK/add/$path"
        ;;
    esac
  done < "$plan"

  while IFS="	" read -r kind src dest; do
    [ "$kind" = "ADDCOPY" ] || continue
    staged=1
    mkdir -p -- "$ARCHIVE_WORK/add/$(dirname -- "$dest")"
    rm -rf -- "$ARCHIVE_WORK/copy"
    mkdir -p -- "$ARCHIVE_WORK/copy"
    "$SEVENZIP" x -bso0 -bsp0 -o"$ARCHIVE_WORK/copy" "$abs" "$src" ||
      die "could not read '$src' out of '$archive'"
    mv -- "$ARCHIVE_WORK/copy/$src" "$ARCHIVE_WORK/add/$dest" ||
      die "could not stage the copy of '$src'"
  done < "$plan"

  if [ "$staged" = 1 ]; then
    while IFS="	" read -r kind path _; do
      case "$kind" in
        ADDFILE|ADDDIR)
          say "· inside $archive: add $path"
          ( cd "$ARCHIVE_WORK/add" && "$SEVENZIP" a -bso0 -bsp0 "$abs" "$path" ) ||
            die "7-Zip could not add '$path' to '$archive'"
          ;;
      esac
    done < "$plan"
  fi
}
`;
