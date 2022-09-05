import { SerialPort } from 'serialport'
import LedClient from 'pixel-canvas-client-node'

interface PaintCommand {
  pos: number,
  r: number,
  g: number,
  b: number
}
const NUM_PIXELS = 256
const PAINT_SPEED = 100
const BAUD_RATE = 9600
const SERIAL_PORT_PATH = '/dev/tty.usbmodem11301'
const READY_MESSAGE = 'r'
const PAINT_OPERATION_COMPLETE_MESSAGE = 'd'

const port = new SerialPort({
  path: SERIAL_PORT_PATH,
  baudRate: BAUD_RATE
})

var canvasReady = false
port.once('data', (data) => {
  if (data == READY_MESSAGE) {
    canvasReady = true
  }
})

var currMatrixState: Array<number> = new Array(NUM_PIXELS).fill(0)
const pendingCommands: Array<PaintCommand> = []
var isCommandProcessing = false

LedClient.setStateListener((state) => {
  const newMatrixState = getTransformedServerState(state)
  const commands = diff(currMatrixState, newMatrixState)
  pendingCommands.push(...commands)
  currMatrixState = newMatrixState
})

setInterval(async () => {
  if (canvasReady && pendingCommands.length > 0 && !isCommandProcessing) {
    isCommandProcessing = true
    const command = pendingCommands.shift()
    if (command != undefined) {
      await sendCommand(port, command)
      isCommandProcessing = false
    }
  }
}, PAINT_SPEED)

function getTransformedServerState(serverState: Array<Array<number>>): Array<number> {
  //need to reorder matrix to fit LED matrix ordering
  const matrix: Array<Array<number>> = []
  serverState.forEach((row, idx) => {
    if (idx % 2 != 0) {
      matrix.push(row.slice().reverse())
    } else {
      matrix.push(row)
    }
  })
  return matrix.flat().reverse()
}

async function sendCommand(port: SerialPort, command: PaintCommand): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const commandToWrite = `[${command.pos},${command.r},${command.g},${command.b}]`
    port.write(commandToWrite, (error) => {
      if (error) {
        reject()
      } else {
        port.once('data', (data) => {
          if (data == PAINT_OPERATION_COMPLETE_MESSAGE) {
            resolve()
          } else {
            reject()
          }
        })
      }
    })
  })
}

function diff(matrixState: Array<number>, serverState: Array<number>): Array<PaintCommand> {
  const commands = []
  for (let i = 0; i < NUM_PIXELS; i++) {
    if (matrixState[i] != serverState[i]) {
      const rgb = decimalColorToRgb(serverState[i])
      commands.push({pos: i, r: rgb.r, g: rgb.g, b: rgb.b})
    }
  }
  return commands
}

function decimalColorToRgb(color: number): {r: number, g: number, b: number} {
  const r = Math.floor(color / (256*256))
  const g = Math.floor(color / 256) % 256
  const b = color % 256
  return {r:r, g:g, b:b}
}