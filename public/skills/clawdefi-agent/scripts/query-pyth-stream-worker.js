#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { getArg, parseArgs } = require('./market-intel-common.js')

const STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || '', '.openclaw')
const STREAM_DIR = path.join(STATE_DIR, 'clawdefi', 'pyth-stream')

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readJson (filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJson (filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

function isStoppingSignal (signal) {
  return signal === 'SIGTERM' || signal === 'SIGINT'
}

;(async () => {
  const args = parseArgs(process.argv.slice(2))
  const sessionId = String(getArg(args, 'session-id', 'sessionId') || '').trim()
  if (!sessionId) {
    process.exit(2)
  }

  const sessionFile = path.join(STREAM_DIR, `${sessionId}.json`)
  const eventsFile = path.join(STREAM_DIR, `${sessionId}.events.ndjson`)
  const stateFile = path.join(STREAM_DIR, `${sessionId}.state.json`)
  const logFile = path.join(STREAM_DIR, `${sessionId}.log`)

  await fs.mkdir(STREAM_DIR, { recursive: true })

  let state = (await readJson(stateFile, null)) || {
    seq: 0,
    lastEventAt: null,
    lastError: null,
    lastPollAt: null
  }

  for (;;) {
    const session = await readJson(sessionFile, null)
    if (!session || session.closedAt) {
      await writeJson(stateFile, {
        ...state,
        stoppedAt: new Date().toISOString(),
        stopReason: 'session_closed'
      })
      break
    }

    const feedIds = String(session.feedIds || '').trim()
    if (!feedIds) {
      state = {
        ...state,
        lastError: 'Missing feed ids in session file.',
        lastPollAt: new Date().toISOString()
      }
      await writeJson(stateFile, state)
      await sleep(1000)
      continue
    }

    const child = spawnSync(
      process.execPath,
      [
        path.join(__dirname, 'query-pyth.js'),
        'stream',
        '--feed-ids',
        feedIds,
        '--max-events',
        String(session.maxEventsPerPoll || 5),
        '--stream-timeout-ms',
        String(session.streamTimeoutMs || 30000),
        '--json'
      ],
      {
        encoding: 'utf8'
      }
    )

    const nowIso = new Date().toISOString()

    if (child.status !== 0) {
      const err = (child.stderr || child.stdout || 'query-pyth stream failed').trim()
      state = {
        ...state,
        lastError: err,
        lastPollAt: nowIso
      }
      await fs.appendFile(logFile, `[${nowIso}] error: ${err}\n`)
      await writeJson(stateFile, state)

      if (isStoppingSignal(child.signal)) {
        break
      }

      await sleep(1500)
      continue
    }

    let payload = null
    try {
      payload = JSON.parse(child.stdout)
    } catch {
      payload = null
    }

    const events = Array.isArray(payload && payload.events) ? payload.events : []
    for (const event of events) {
      state.seq += 1
      const record = {
        seq: state.seq,
        sessionId,
        at: new Date().toISOString(),
        event
      }
      await fs.appendFile(eventsFile, `${JSON.stringify(record)}\n`)
      state.lastEventAt = record.at
    }

    state = {
      ...state,
      lastError: null,
      lastPollAt: nowIso
    }
    await writeJson(stateFile, state)

    await sleep(250)
  }
})().catch(async (error) => {
  try {
    const nowIso = new Date().toISOString()
    const sessionId = process.argv.includes('--session-id')
      ? process.argv[process.argv.indexOf('--session-id') + 1]
      : null
    if (sessionId) {
      const logFile = path.join(STREAM_DIR, `${sessionId}.log`)
      await fs.appendFile(logFile, `[${nowIso}] fatal: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  } catch {}
  process.exit(1)
})
