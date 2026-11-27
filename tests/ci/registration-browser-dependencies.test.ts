import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {test} from 'node:test'
import {validateUbuntuSources} from '../../scripts/ci/ubuntu-sources.mts'

const archive = `# Ubuntu archive\nTypes: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates noble-backports\nComponents: main universe restricted multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb\nURIs: http://security.ubuntu.com/ubuntu/\nSuites: noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n`

test('registration apt view accepts signed Ubuntu Noble archive variants', () => {
  assert.doesNotThrow(() => validateUbuntuSources(archive))
  assert.doesNotThrow(() => validateUbuntuSources(archive.replace('mirror+file:/etc/apt/apt-mirrors.txt', 'http://us-east-2.ec2.archive.ubuntu.com/ubuntu/').replace('Types: deb', 'Types: deb\nArchitectures: amd64\nEnabled: yes')))
})

test('registration apt view fails closed on mixed, unsigned or unknown sources', () => {
  for (const invalid of [
    archive.replace('mirror+file:/etc/apt/apt-mirrors.txt', 'https://packages.microsoft.com/ubuntu'),
    archive.replace('Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg', 'Trusted: yes'),
    archive.replace('noble-security', 'noble-proposed'),
    archive.replace('Types: deb', 'Types: deb deb-src'),
    archive.replace('Components: main universe', 'Components: main'),
    archive + '\nTypes: deb\nURIs: https://evil.example/ubuntu\nSuites: noble\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n',
    archive.replace('Types: deb', 'Types: deb\nTypes: deb'),
    archive.replace('Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg', 'Signed-By: /tmp/unknown.gpg'),
  ]) assert.throws(() => validateUbuntuSources(invalid))
})

test('registration installer keeps signed sources isolated and browser download unprivileged', async () => {
  const script = await readFile(new URL('../../scripts/ci/install-registration-browser.sh', import.meta.url), 'utf8')
  assert.match(script, /trap 'rm -rf -- "\$task_dir"' EXIT/)
  assert.match(script, /sudo env "APT_CONFIG=\$task_dir\/apt.conf" "\$node_path" "\$root\/node_modules\/playwright\/cli.js" install-deps chromium/)
  assert.match(script, /"\$node_path" "\$root\/node_modules\/playwright\/cli.js" install chromium/)
  assert.doesNotMatch(script, /allow-unauthenticated|trusted=yes|insecure/i)
})
