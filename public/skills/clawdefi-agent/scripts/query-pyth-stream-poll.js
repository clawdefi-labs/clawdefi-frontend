#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { getArg, parseArgs, parseIntArg, printJson } = require('./market-intel-common.js')

const STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || '', '.openclaw')
const STREAM_DIR = path.join(STATE_DIR, 'clawdefi', 'pyth-stream')

async function readJson (filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

function isPidAlive (pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
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

    const cursor = parseIntArg(getArg(args, 'cursor'), 'cursor', 0, { min: 0 })
    const limit = parseIntArg(getArg(args, 'limit'), 'limit', 20, { min: 1, max: 200 })

    const sessionPath = path.join(STREAM_DIR, `${sessionId}.json`)
    const eventsPath = path.join(STREAM_DIR, `${sessionId}.events.ndjson`)
    const statePath = path.join(STREAM_DIR, `${sessionId}.state.json`)

    const [session, state] = await Promise.all([
      readJson(sessionPath),
      readJson(statePath).catch(() => ({ seq: 0, lastEventAt: null, lastError: null, lastPollAt: null }))
    ])

    const rawEvents = await fs.readFile(eventsPath, 'utf8').catch(() => '')
    const lines = rawEvents
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const parsed = []
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line))
      } catch {
        continue
      }
    }

    const fresh = parsed.filter((item) => Number(item.seq || 0) > cursor)
    const batch = fresh.slice(0, limit)
    const nextCursor = batch.length > 0
      ? Number(batch[batch.length - 1].seq || cursor)
      : cursor

    printJson({
      ok: true,
      action: 'query_pyth_stream_poll',
      mode: 'buffered-stream-poll',
      sessionId,
      streamStatus: {
        pid: session.pid || null,
        alive: isPidAlive(Number(session.pid || 0)),
        lastPollAt: state.lastPollAt || null,
        lastEventAt: state.lastEventAt || null,
        lastError: state.lastError || null
      },
      cursor,
      nextCursor,
      hasMore: fresh.length > batch.length,
      events: batch.map((item) => item.event)
    })
  } catch (error) {
    printJson({
      ok: false,
      action: 'query_pyth_stream_poll',
      error: error.message
    })
    process.exit(1)
  }
})()
