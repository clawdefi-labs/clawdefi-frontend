#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { getArg, parseArgs, printJson } = require('./market-intel-common.js')

const STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || '', '.openclaw')
const STREAM_DIR = path.join(STATE_DIR, 'clawdefi', 'pyth-stream')

;(async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const feedIds = String(getArg(args, 'feed-ids', 'feedIds') || '').trim()
    if (!feedIds) {
      throw new Error('Missing --feed-ids (comma-separated feed ids).')
    }

    const sessionId = `pyth_${crypto.randomUUID()}`
    await fs.mkdir(STREAM_DIR, { recursive: true })

    const sessionPath = path.join(STREAM_DIR, `${sessionId}.json`)
    const eventsPath = path.join(STREAM_DIR, `${sessionId}.events.ndjson`)
    const statePath = path.join(STREAM_DIR, `${sessionId}.state.json`)

    const session = {
      sessionId,
      feedIds,
      createdAt: new Date().toISOString(),
      streamTimeoutMs: Number.parseInt(String(getArg(args, 'stream-timeout-ms', 'streamTimeoutMs') || '30000'), 10),
      maxEventsPerPoll: Number.parseInt(String(getArg(args, 'max-events', 'maxEvents') || '5'), 10),
      mode: 'buffered-stream-poll'
    }

    await fs.writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`)
    await fs.writeFile(eventsPath, '')
    await fs.writeFile(statePath, `${JSON.stringify({ seq: 0, lastEventAt: null, lastError: null, lastPollAt: null }, null, 2)}\n`)

    const workerPath = path.join(__dirname, 'query-pyth-stream-worker.js')
    const child = spawn(process.execPath, [workerPath, '--session-id', sessionId], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    session.pid = child.pid
    await fs.writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`)

    printJson({
      ok: true,
      action: 'query_pyth_stream_open',
      session
    })
  } catch (error) {
    printJson({
      ok: false,
      action: 'query_pyth_stream_open',
      error: error.message
    })
    process.exit(1)
  }
})()
