"""Verify installed wheel bytes and record the profile's semantic resources."""
import base64
import hashlib


def verify_installed_files(distribution):
    verified = 0
    semantic_files = {}
    for entry in distribution.files or []:
        if entry.hash is None:
            continue
        path = distribution.locate_file(entry)
        digest = hashlib.new(entry.hash.mode, path.read_bytes()).digest()
        encoded = base64.urlsafe_b64encode(digest).decode().rstrip('=')
        assert encoded == entry.hash.value, f'Installed dependency content differs from RECORD: {entry}'
        verified += 1
        name = str(entry)
        if name.startswith(('rocrate_validator/profiles/ro-crate/', 'owlrl/')) and name.endswith(('.py', '.ttl')):
            semantic_files[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    assert verified, 'Installed dependency has no recorded hashed files'
    return dict(files_verified=verified, semantic_inputs=semantic_files)
