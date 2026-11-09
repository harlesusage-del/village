import { Server, matchMaker } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { VillageRoom } from './VillageRoom'
import { ROOM_NAME } from '../../src/net/protocol'

export async function startServer(port: number): Promise<Server> {
  const origin = process.env.ALLOWED_ORIGIN
  if (origin) matchMaker.controller.DEFAULT_CORS_HEADERS['Access-Control-Allow-Origin'] = origin
  const server = new Server({ transport: new WebSocketTransport({ pingInterval: 5000, pingMaxRetries: 3 }) })
  server.define(ROOM_NAME, VillageRoom)
  await server.listen(port)
  return server
}
