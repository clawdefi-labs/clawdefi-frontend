#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { getArg, parseArgs, printJson } = require('./market-intel-common.js')

const STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || '', '.openclaw')
const STREAM_DIR = path.join(STATE_DIR, 'clawdefi', 'pyth-stream')

function tryKill (pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 'SIGTERM')
    return true
  } catch {
    return false
  }
}

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const sessionId = String(getArg(args, 'session-id', 'sessionId') || '').trim()
    if (!sessionId) {
      throw new Error('Missing --session-id.')
    }

    const sessionPath = path.join(STREAM_DIR, `${sessionId}.json`)
    const eventsPath = path.join(STREAM_DIR, `${sessionId}.events.ndjson`)
    const statePath = path.join(STREAM_DIR, `${sessionId}.state.json`)
    const logPath = path.join(STREAM_DIR, `${sessionId}.log`)

    const sessionRaw = await fs.readFile(sessionPath, 'utf8')
    const session = JSON.parse(sessionRaw)

    const killed = tryKill(Number(session.pid || 0))

    const closed = {
      ...session,
      closedAt: new Date().toISOString(),
      killed
    }

    await fs.writeFile(sessionPath, `${JSON.stringify(closed, null, 2)}\n`)

    await Promise.all([
      fs.rm(sessionPath, { force: true }),
      fs.rm(eventsPath, { force: true }),
      fs.rm(statePath, { force: true }),
      fs.rm(logPath, { force: true })
    ])

    printJson({
      ok: true,
      action: 'query_pyth_stream_close',
      sessionId,
      killed
    })
  } catch (error) {
    printJson({
      ok: false,
      action: 'query_pyth_stream_close',
      error: error.message
    })
    process.exit(1)
  }
})()
