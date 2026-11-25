import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {chromium} from 'playwright'

const base = 'http://127.0.0.1:4329'
test('a researcher edits and downloads the current study metadata', async () => {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {
    cwd: new URL('..', import.meta.url), env: {...process.env, HOST: '127.0.0.1', PORT: '4329'}, stdio: 'ignore',
  })
  let browser
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base)).ok) break } catch {}
      if (attempt === 100 || server.exitCode !== null) throw new Error('Built application did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({headless: true})
    const page = await browser.newPage({acceptDownloads: true})
    page.setDefaultTimeout(5000)
    const externalRequests: string[] = []
    const fontResponses: number[] = []
    page.on('response', response => {if (response.url().includes('/visual-framework/') && response.url().endsWith('.woff')) fontResponses.push(response.status())})
    page.on('request', request => {if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) externalRequests.push(request.url())})
    const stylesheet = page.waitForResponse(response => response.url() === base + '/visual-framework/css/styles.css')
    await page.goto(base)
    assert.equal((await stylesheet).status(), 200)
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.evaluate(() => document.fonts.check('16px \"IBM Plex Sans\"')), true)
    assert.ok(fontResponses.length > 0 && fontResponses.every(status => status === 200))
    const create = page.getByRole('button', {name: 'Create study'})
    assert.match(await create.getAttribute('class') ?? '', /\bvf-button--primary\b/)
    assert.equal(await create.evaluate(button => getComputedStyle(button).borderRadius), '0px')
    const restingShadow = await create.evaluate(button => getComputedStyle(button).boxShadow)
    await create.focus()
    assert.notEqual(await create.evaluate(button => getComputedStyle(button).boxShadow), restingShadow)
    await create.click()
    await page.getByLabel('Study title').fill('Microscopy study')
    await page.getByLabel('Description').fill('An example study')
    await page.getByLabel('License').fill('https://creativecommons.org/licenses/by/4.0/')
    await page.getByLabel('Funding statement').fill('Supported by a research fund')
    await page.getByRole('button', {name: 'Add affiliation'}).click()
    await page.getByLabel('Affiliation name 1').fill('Shared institute')
    await page.getByRole('button', {name: 'Add contributor'}).click()
    await page.getByRole('button', {name: 'Add contributor'}).click()
    await page.getByLabel('Contributor name 1').fill('First researcher')
    await page.getByLabel('Contributor name 2').fill('Second researcher')
    await page.getByRole('group', {name: 'Affiliations for contributor 1'}).getByRole('checkbox', {name: 'Shared institute'}).check()
    await page.getByRole('group', {name: 'Affiliations for contributor 2'}).getByRole('checkbox', {name: 'Shared institute'}).check()
    await page.getByRole('button', {name: 'Delete affiliation 1'}).click()
    assert.match(await page.getByRole('alert').innerText(), /2 references/i)
    await page.getByRole('button', {name: 'Move contributor 2 up'}).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', {name: 'Add publication'}).click()
    await page.getByLabel('Publication title 1').fill('A published study')
    await page.getByLabel('Publication DOI 1').fill('10.1234/example')
    await page.getByRole('button', {name: 'Add funding body'}).click()
    await page.getByLabel('Funding body name 1').fill('Research fund')
    await page.getByRole('button', {name: 'Add grant'}).click()
    await page.getByLabel('Grant identifier 1').fill('award-7')
    await page.getByRole('group', {name: 'Funding bodies for grant 1'}).getByRole('checkbox', {name: 'Research fund'}).check()
    const download = page.waitForEvent('download')
    await page.getByRole('button', {name: 'Download metadata'}).click()
    const file = await download
    assert.equal(file.suggestedFilename(), 'ro-crate-metadata.json')
    const chunks = []
    for await (const chunk of await file.createReadStream()) chunks.push(chunk)
    const metadata = JSON.parse(Buffer.concat(chunks).toString()) as {'@graph': Array<Record<string, unknown>>}
    const study = metadata['@graph'].find(item => item['@id'] === './')
    assert.ok(study)
    assert.equal(study.name, 'Microscopy study')
    assert.equal(study.description, 'An example study')
    assert.equal(study.license, 'https://creativecommons.org/licenses/by/4.0/')
    assert.equal(study.fundingStatement, 'Supported by a research fund')
    const byId = new Map(metadata['@graph'].map(node => [node['@id'], node]))
    const people = study.author as Array<{'@id': string}>
    assert.deepEqual(people.map(ref => byId.get(ref['@id'])?.name), ['Second researcher', 'First researcher'])
    const institution = metadata['@graph'].find(node => node.name === 'Shared institute')
    assert.ok(institution)
    for (const person of people) assert.deepEqual(byId.get(person['@id'])?.memberOf, [{'@id': institution['@id']}])
    const publications = study.relatedPublication as Array<{'@id': string}>
    assert.equal(byId.get(publications[0]['@id'])?.doi, '10.1234/example')
    const funding = study.funding as Array<{'@id': string}>
    const grant = byId.get(funding[0]['@id'])
    assert.equal(grant?.identifier, 'award-7')
    const body = metadata['@graph'].find(node => node.name === 'Research fund')
    assert.ok(body)
    assert.deepEqual(grant?.funder, [{'@id': body['@id']}])
    assert.match(await page.getByRole('status').innerText(), /not saved/i)
    await page.setViewportSize({width: 900, height: 844})
    const mediumGuidance = page.getByRole('button', {name: /study guidance/i})
    if (await mediumGuidance.getAttribute('aria-expanded') === 'false') await mediumGuidance.click()
    const panel = await page.locator('#study-guidance').boundingBox()
    const heading = await page.getByRole('heading', {name: 'Microscopy study'}).boundingBox()
    assert.ok(panel && heading && panel.y + panel.height <= heading.y, 'Expanded guidance must not overlap the editor')
    await page.getByLabel('Study title').click({timeout: 3000})
    await page.getByRole('button', {name: /study guidance/i}).click()
    await page.setViewportSize({width: 390, height: 844})
    const guidance = page.getByRole('button', {name: /study guidance/i})
    assert.equal(await guidance.getAttribute('aria-expanded'), 'false')
    await guidance.click()
    assert.equal(await guidance.getAttribute('aria-expanded'), 'true')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    assert.deepEqual(externalRequests, [])
  } finally {
    await browser?.close()
    server.kill()
  }
})
