import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {chromium} from 'playwright'

const base = 'http://127.0.0.1:4337'
test('a researcher assigns and checks current vocabulary assertions', async () => {
  const server = spawn(process.execPath,['../../artifacts/web/dist/server/entry.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:'4337'},stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0;; attempt++) {
      try {if ((await fetch(base)).ok) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Built app did not start')
      await new Promise(resolve => setTimeout(resolve,100))
    }
    assert.equal((await fetch(base + '/api/vocabulary?kind=unknown&mode=exact&value=https%3A%2F%2Fexample.org')).status,400)
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage({acceptDownloads:true}); page.setDefaultTimeout(5000)
    let delayNext = false
    await page.route('**/api/vocabulary?*', async route => {
      if (delayNext) {delayNext = false; await new Promise(resolve => setTimeout(resolve,250))}
      const url = new URL(route.request().url()), value = url.searchParams.get('value')
      const body = url.searchParams.get('mode') === 'search' ? {status:'ok',suggestions:[{identifier:'NCBITaxon:9606',label:'Homo sapiens'}]} : value === 'NCBITaxon:9606' ? {status:'found',term:{source:'fixture',identifier:value,label:'Homo sapiens',synonyms:['human'],obsolete:false,retrievedAt:'2026-11-25T00:00:00Z'}} : value === 'FBbi:99999999' ? {status:'not-found',identifier:value,source:'fixture',retrievedAt:'2026-11-25T00:00:00Z'} : value === 'FBbi:00000001' ? {status:'found',term:{source:'fixture',identifier:value,label:'old method',synonyms:[],obsolete:true,retrievedAt:'2026-11-25T00:00:00Z'}} : {status:'unavailable'}
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
    })
    await page.goto(base); await page.getByRole('button',{name:'Create study'}).click()
    const nav = page.getByRole('navigation',{name:'Study sections',exact:true})
    await nav.getByRole('link',{name:'Biosamples',exact:true}).click()
    await page.getByRole('button',{name:'Add biosample'}).click()
    const add = page.getByRole('group',{name:'Add organism to biosample 1'})
    await add.getByLabel('Add organism to biosample 1 label').fill('Drosophila melanogaster')
    await add.getByLabel('Add organism to biosample 1 identifier').fill('NCBITaxon:9606')
    await add.getByRole('button',{name:'Apply identifier and label for Add organism to biosample 1'}).click()
    const organism = page.getByRole('group',{name:'Organism 1 for biosample 1'})
    await organism.getByRole('button',{name:'Check current value for Organism 1 for biosample 1'}).click()
    await organism.getByText(/do not match/).waitFor()
    await organism.getByLabel('Organism 1 for biosample 1 label').fill('Homo sapiens')
    assert.equal(await organism.getByText(/do not match/).count(),0)
    await organism.getByRole('button',{name:'Apply identifier and label for Organism 1 for biosample 1'}).click()
    await organism.getByRole('button',{name:'Check current value for Organism 1 for biosample 1'}).click()
    await organism.getByText(/Verified against/).waitFor()
    delayNext = true
    await organism.getByRole('button',{name:'Check current value for Organism 1 for biosample 1'}).click()
    await organism.getByLabel('Organism 1 for biosample 1 label').fill('human')
    await page.waitForTimeout(350)
    assert.equal(await organism.getByText(/Verified against/).count(),0)
    assert.equal(await organism.getByText(/Verified against/).count(),0)
    await organism.getByRole('button',{name:'Search suggestions for Organism 1 for biosample 1'}).click()
    await organism.getByText(/Suggestions are not verified/).waitFor()
    assert.equal(await organism.getByText(/Verified against/).count(),0)
    await nav.getByRole('link',{name:'Protocols',exact:true}).click()
    await page.getByRole('button',{name:'Add acquisition protocol'}).click()
    const imaging = page.getByRole('group',{name:'Imaging method for acquisition protocol 1'})
    await imaging.getByLabel('Imaging method for acquisition protocol 1 label').fill('unknown method')
    await imaging.getByLabel('Imaging method for acquisition protocol 1 identifier').fill('FBbi:99999999')
    await imaging.getByRole('button',{name:'Apply identifier and label for Imaging method for acquisition protocol 1'}).click()
    await imaging.getByRole('button',{name:'Check current value for Imaging method for acquisition protocol 1'}).click()
    await imaging.getByText(/Identifier not found/).waitFor()
    await imaging.getByLabel('Imaging method for acquisition protocol 1 identifier').fill('FBbi:00000001')
    await imaging.getByLabel('Imaging method for acquisition protocol 1 label').fill('old method')
    await imaging.getByRole('button',{name:'Apply identifier and label for Imaging method for acquisition protocol 1'}).click()
    await imaging.getByRole('button',{name:'Check current value for Imaging method for acquisition protocol 1'}).click()
    await imaging.getByText(/marks this term obsolete/).waitFor()
    await imaging.getByLabel('Imaging method for acquisition protocol 1 identifier').fill('FBbi:00000002')
    await imaging.getByLabel('Imaging method for acquisition protocol 1 label').fill('unknown method')
    await imaging.getByRole('button',{name:'Apply identifier and label for Imaging method for acquisition protocol 1'}).click()
    await imaging.getByRole('button',{name:'Check current value for Imaging method for acquisition protocol 1'}).click()
    await imaging.getByText(/service unavailable/).waitFor()
    await imaging.getByLabel('Imaging method for acquisition protocol 1 identifier').fill('')
    await imaging.getByRole('button',{name:'Apply identifier and label for Imaging method for acquisition protocol 1'}).click()
    await imaging.getByRole('button',{name:'Check current value for Imaging method for acquisition protocol 1'}).click()
    await imaging.getByText(/Descriptive text/).waitFor()
    await nav.getByRole('link',{name:'Export metadata',exact:true}).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button',{name:'Download metadata'}).click()
    const bytes = await (await download).createReadStream(); let content = ''
    for await (const chunk of bytes) content += chunk.toString()
    const graph = JSON.parse(content)['@graph'] as Array<Record<string,unknown>>
    const taxon = graph.find(node => node['@id'] === 'http://purl.obolibrary.org/obo/NCBITaxon_9606')
    assert.equal(taxon?.scientificName,'Homo sapiens')
    const protocol = graph.find(node => Array.isArray(node['@type']) && node['@type'].includes('bia:ImageAcquisitionProtocol'))
    assert.deepEqual(protocol?.imagingMethodName,['unknown method'])
    assert.deepEqual(protocol?.fbbiId,[])
  } finally {await browser?.close(); server.kill('SIGTERM')}
})
