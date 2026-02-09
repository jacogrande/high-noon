import { describe, it, expect } from 'bun:test'
import { InputBuffer } from './InputBuffer'
import type { NetworkInput } from '@high-noon/shared'

function makeInput(seq: number): NetworkInput {
  return {
    seq,
    buttons: 0,
    aimAngle: 0,
    moveX: 0,
    moveY: 0,
    cursorWorldX: 0,
    cursorWorldY: 0,
  }
}

describe('InputBuffer', () => {
  it('push + getPending returns all in order', () => {
    const buf = new InputBuffer()
    buf.push(makeInput(1))
    buf.push(makeInput(2))
    buf.push(makeInput(3))

    const pending = buf.getPending()
    expect(pending).toHaveLength(3)
    expect(pending[0]!.seq).toBe(1)
    expect(pending[1]!.seq).toBe(2)
    expect(pending[2]!.seq).toBe(3)
  })

  it('acknowledgeUpTo removes correct entries', () => {
    const buf = new InputBuffer()
    buf.push(makeInput(1))
    buf.push(makeInput(2))
    buf.push(makeInput(3))
    buf.push(makeInput(4))
    buf.push(makeInput(5))

    buf.acknowledgeUpTo(3)

    const pending = buf.getPending()
    expect(pending).toHaveLength(2)
    expect(pending[0]!.seq).toBe(4)
    expect(pending[1]!.seq).toBe(5)
  })

  it('acknowledgeUpTo with gaps removes correctly', () => {
    const buf = new InputBuffer()
    buf.push(makeInput(1))
    buf.push(makeInput(3))
    buf.push(makeInput(5))

    buf.acknowledgeUpTo(2)

    const pending = buf.getPending()
    expect(pending).toHaveLength(2)
    expect(pending[0]!.seq).toBe(3)
    expect(pending[1]!.seq).toBe(5)
  })

  it('acknowledgeUpTo(0) is a no-op', () => {
    const buf = new InputBuffer()
    buf.push(makeInput(1))
    buf.push(makeInput(2))

    buf.acknowledgeUpTo(0)

    expect(buf.getPending()).toHaveLength(2)
  })

  it('overflow evicts oldest', () => {
    const buf = new InputBuffer(3)
    buf.push(makeInput(1))
    buf.push(makeInput(2))
    buf.push(makeInput(3))
    buf.push(makeInput(4))

    expect(buf.length).toBe(3)
    const pending = buf.getPending()
    expect(pending[0]!.seq).toBe(2)
    expect(pending[1]!.seq).toBe(3)
    expect(pending[2]!.seq).toBe(4)
  })

  it('clear empties buffer', () => {
    const buf = new InputBuffer()
    buf.push(makeInput(1))
    buf.push(makeInput(2))
    buf.push(makeInput(3))

    buf.clear()

    expect(buf.length).toBe(0)
    expect(buf.getPending()).toHaveLength(0)
  })

  it('length tracks correctly', () => {
    const buf = new InputBuffer()
    expect(buf.length).toBe(0)

    buf.push(makeInput(1))
    expect(buf.length).toBe(1)

    buf.push(makeInput(2))
    buf.push(makeInput(3))
    expect(buf.length).toBe(3)

    buf.acknowledgeUpTo(2)
    expect(buf.length).toBe(1)

    buf.clear()
    expect(buf.length).toBe(0)
  })
})
