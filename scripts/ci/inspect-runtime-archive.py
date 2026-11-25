"""Inspect prepared runtime archive ownership before the caller allows extraction.

The caller provides trusted ownership roots; the archive supplies only a receipt.
This CI archive check is separate from the independent validator reference.
"""

import json, os, pathlib, re, sys, tarfile
archive, root, kind, mode, manifest_name = sys.argv[1:]
if kind not in ('assets', 'reference'):
    raise ValueError('Unknown bundle kind')
if mode not in ('inspect', 'extract'):
    raise ValueError('Unknown inspection mode')
policy = json.loads(sys.stdin.read())
allowed = policy['roots']
workspaces = policy['workspaces']
def beneath(path, parent):
    return path == parent or path.startswith(parent + '/')
def owned(path):
    return path == manifest_name or any(beneath(path, p) for p in allowed)
def clean(path):
    if not path or path.startswith('/') or '\\' in path or any(p == '..' for p in path.split('/')):
        raise ValueError('Unsafe archive path: ' + path)
    value = str(pathlib.PurePosixPath(path))
    if not owned(value): raise ValueError('Unexpected archive path: ' + path)
    return value
with tarfile.open(archive, 'r:gz') as tar:
    members = tar.getmembers()
    names = [clean(m.name) for m in members]
    if len(names) != len(set(names)): raise ValueError('Duplicate archive paths')
    by_name = dict(zip(names, members))
    if manifest_name not in by_name or not by_name[manifest_name].isfile():
        raise ValueError('Missing regular bundle manifest')
    manifest = json.load(tar.extractfile(by_name[manifest_name]))
    if manifest.get('kind') != kind or manifest.get('roots') != allowed:
        raise ValueError('Unexpected bundle ownership manifest')
    external = {x['path']: x['target'] for x in manifest.get('external_symlinks', [])}
    if len(external) != len(manifest.get('external_symlinks', [])): raise ValueError('Duplicate interpreter links')
    links = set()
    for name, m in zip(names, members):
        if not (m.isfile() or m.isdir() or m.issym() or m.islnk()):
            raise ValueError('Unexpected archive entry type: ' + name)
        if m.issym():
            links.add(name)
            if os.path.isabs(m.linkname):
                if kind != 'reference' or not re.fullmatch(r'artifacts/reference/python-env/bin/python(?:3(?:\.13)?)?', name) or external.get(name) != m.linkname:
                    raise ValueError('Unexpected absolute symlink: ' + name)
            else:
                target = os.path.normpath(os.path.join(os.path.dirname(name), m.linkname)).replace(os.sep, '/')
                if not (any(beneath(target, p) for p in allowed) or
                        kind == 'assets' and target in workspaces):
                    raise ValueError('Symlink escapes prepared ownership: ' + name)
        if m.islnk():
            target = clean(m.linkname)
            if target not in by_name or not by_name[target].isfile():
                raise ValueError('Hard link lacks an owned regular target: ' + name)
    for name in names:
        if any(parent.as_posix() in links for parent in pathlib.PurePosixPath(name).parents):
            raise ValueError('Archive path traverses a symlink: ' + name)
    if set(external) != {n for n in names if by_name[n].issym() and os.path.isabs(by_name[n].linkname)}:
        raise ValueError('Interpreter link receipts differ from archive')
    if mode == 'extract':
        # Destinations are checked by the caller before any archive entry writes.
        tar.extractall(root, filter=lambda member, _path: member.replace(
            uid=None, gid=None, uname=None, gname=None, mode=member.mode & 0o777))
print(json.dumps(manifest))
