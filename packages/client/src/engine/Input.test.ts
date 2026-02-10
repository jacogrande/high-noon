import { afterEach, describe, expect, test } from 'bun:test'
import { Button } from '@high-noon/shared'
import { Input } from './Input'

type Listener = (event: unknown) => void

class FakeWindow {
  private readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const fn: Listener = typeof listener === 'function'
      ? listener
      : (event) => listener.handleEvent(event as Event)
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set<Listener>()
      this.listeners.set(type, set)
    }
    set.add(fn)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const set = this.listeners.get(type)
    if (!set) return
    const fn: Listener = typeof listener === 'function'
      ? listener
      : (event) => listener.handleEvent(event as Event)
    set.delete(fn)
  }

  dispatch(type: string, event: unknown): void {
    const set = this.listeners.get(type)
    if (!set) return
    for (const fn of set) fn(event)
  }
}

const g = globalThis as Record<string, unknown>
const originalWindow = g.window

afterEach(() => {
  if (originalWindow === undefined) {
    delete g.window
  } else {
    g.window = originalWindow
  }
})

function hasButton(buttons: number, flag: number): boolean {
  return (buttons & flag) !== 0
}

describe('Input transient action buffering', () => {
  test('preserves quick left click between polls as a one-tick SHOOT pulse', () => {
    const fakeWindow = new FakeWindow()
    g.window = fakeWindow as unknown as Window & typeof globalThis

    const input = new Input()
    fakeWindow.dispatch('mousedown', { button: 0 })
    fakeWindow.dispatch('mouseup', { button: 0 })

    const firstTick = input.getInputState()
    expect(hasButton(firstTick.buttons, Button.SHOOT)).toBe(true)

    const secondTick = input.getInputState()
    expect(hasButton(secondTick.buttons, Button.SHOOT)).toBe(false)

    input.destroy()
  })

  test('preserves quick space tap between polls as a one-tick JUMP pulse', () => {
    const fakeWindow = new FakeWindow()
    g.window = fakeWindow as unknown as Window & typeof globalThis

    const input = new Input()
    fakeWindow.dispatch('keydown', { code: 'Space', repeat: false })
    fakeWindow.dispatch('keyup', { code: 'Space' })

    const firstTick = input.getInputState()
    expect(hasButton(firstTick.buttons, Button.JUMP)).toBe(true)

    const secondTick = input.getInputState()
    expect(hasButton(secondTick.buttons, Button.JUMP)).toBe(false)

    input.destroy()
  })
})
