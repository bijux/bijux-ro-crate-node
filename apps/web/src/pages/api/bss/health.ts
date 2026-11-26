import type {APIRoute} from 'astro'
import {checkConnectivity} from '../../../server/bss/connectivity.js'

export const prerender = false

export const GET: APIRoute = async () => {
  try {
    const status = await checkConnectivity(process.env)
    return Response.json({status}, {status: status === 'unavailable' ? 503 : 200, headers: {'cache-control': 'no-store'}})
  } catch {
    return Response.json({status: 'unavailable'}, {status: 503, headers: {'cache-control': 'no-store'}})
  }
}
