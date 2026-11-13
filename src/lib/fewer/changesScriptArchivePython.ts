/**
 * The Python fallback engine for the archive replay.
 *
 * Used when 7-Zip is not installed. Python 3's standard library can rewrite a
 * zip, which makes the whole plan a *name mapping* rather than a sequence of
 * operations:
 *
 *   - a rename is a mapping (a swap is two names swapping — free, no ordering
 *     constraints at all, unlike 7-Zip's sequential renames);
 *   - a delete drops the member;
 *   - a copy is taken out of the archive with its bytes;
 *   - every other member is copied over with its original compression method,
 *     timestamps and attributes, so nothing else changes;
 *   - the new archive is written beside the old one and moved into place, so a
 *     failure leaves the original untouched.
 *
 * The program is embedded in the generated script (a script the user runs on
 * their own machine must not depend on a file next to it), so it is written as
 * a plain program with two modes:
 *
 *   python3 fewer_zip.py --list  <archive>
 *   python3 fewer_zip.py --apply <archive> <plan.tsv>
 *
 * The plan file is tab separated: `MOVE<tab>from<tab>to`, `DELETE<tab>path`,
 * `ADDFILE<tab>path`, `ADDDIR<tab>path`, `ADDCOPY<tab>src<tab>dest`.
 */
export const ARCHIVE_PYTHON_PROGRAM = `import os, sys, zipfile


def read_plan(path):
    moves, deletes, adds, copies = [], [], [], []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.rstrip("\\n")
            if not line:
                continue
            kind, _, rest = line.partition("\\t")
            if kind == "MOVE":
                src, _, dst = rest.partition("\\t")
                moves.append((src, dst))
            elif kind == "DELETE":
                deletes.append(rest)
            elif kind == "ADDFILE":
                adds.append((rest, "file"))
            elif kind == "ADDDIR":
                adds.append((rest, "dir"))
            elif kind == "ADDCOPY":
                src, _, dst = rest.partition("\\t")
                copies.append((src, dst))
    return moves, deletes, adds, copies


def renamed(name, moves):
    """The new name of an entry.

    An exact rename wins over a rename of a folder it sits in: when a folder is
    renamed AND one of its children moved elsewhere, the child's own move is
    the one that applies.
    """
    for src, dst in moves:
        if name == src:
            return dst
    best = None
    for src, dst in moves:
        if name.startswith(src + "/") and (best is None or len(src) > len(best[0])):
            best = (src, dst)
    if best is not None:
        return best[1] + name[len(best[0]):]
    return name


def is_deleted(name, deletes):
    for path in deletes:
        if name == path or name.startswith(path + "/"):
            return True
    return False


def copy_of(item, name):
    """A copy of an archive member under a new name, keeping how it was stored."""
    info = zipfile.ZipInfo(name, date_time=item.date_time)
    info.compress_type = item.compress_type
    info.external_attr = item.external_attr
    info.internal_attr = item.internal_attr
    info.create_system = item.create_system
    info.comment = item.comment
    return info


def main():
    mode = sys.argv[1]
    archive = sys.argv[2]
    with zipfile.ZipFile(archive, "r") as source:
        items = source.infolist()
        if mode == "--list":
            for item in items:
                # Folder entries are listed without their trailing slash, so the
                # names line up with the paths in the plan.
                print(item.filename.rstrip("/"))
            return
        moves, deletes, adds, copies = read_plan(sys.argv[3])
        temp = archive + ".fewer-new"
        with zipfile.ZipFile(temp, "w") as out:
            for item in items:
                if is_deleted(item.filename, deletes):
                    continue
                out.writestr(copy_of(item, renamed(item.filename, moves)), source.read(item))
            for path, kind in adds:
                name = path if kind == "file" else path.rstrip("/") + "/"
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_STORED
                info.external_attr = (0o40755 << 16) | 0x10 if kind == "dir" else (0o100644 << 16)
                out.writestr(info, b"")
            for src, dest in copies:
                for item in items:
                    if item.filename != src and not item.filename.startswith(src + "/"):
                        continue
                    out.writestr(copy_of(item, dest + item.filename[len(src):]), source.read(item))
    os.replace(temp, archive)


main()
`;
