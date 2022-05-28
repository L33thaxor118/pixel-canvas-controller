import { SerialPort } from 'serialport'
import LedClient from 'azledclientnode'

interface PaintCommand {
  pos: number,
  r: number,
  g: number,
  b: number
}

const port = new SerialPort({
  path: '/dev/tty.usbmodem11301',
  baudRate: 9600
})

var currMatrixState: Array<number> = new Array(256).fill(0)
const pendingCommands: Array<PaintCommand> = []
var isCommandProcessing = false

LedClient.setStateListener((state)=>{
  const newMatrixState = transformServerState(state)
  const commands = diff(currMatrixState, newMatrixState)
  pendingCommands.push(...commands)
  currMatrixState = newMatrixState
})

setInterval(async ()=>{
  if (pendingCommands.length > 0 && !isCommandProcessing) {
    isCommandProcessing = true
    const command = pendingCommands.shift()
    if (command != undefined) {
      await sendCommand(port, command)
      isCommandProcessing = false
    }
  }
}, 100)

function transformServerState(serverState: Array<Array<number>>): Array<number> {
  //need to reorder matrix to fit LED matrix ordering
  const matrix: Array<Array<number>> = []
  serverState.forEach((row, idx) => {
    if (idx % 2 != 0) {
      matrix.push(row.reverse())
    } else {
      matrix.push(row)
    }
  })
  return matrix.flat().reverse()
}

async function sendCommand(port: SerialPort, command: PaintCommand): Promise<void> {
  return new Promise<void>((resolve, reject)=>{
    port.write(`[${command.pos},${command.r},${command.g},${command.b}]`, (error)=> {
      if (error) {
        reject()
      } else {
        port.on('data', (data)=>{
          if (data == 'd') {
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
  for (let i = 0; i < 256; i++) {
    if (matrixState[i] != serverState[i]) {
      const rgb = decimalToRgb(serverState[i])
      commands.push({pos: i, r: rgb.r, g: rgb.g, b: rgb.b})
    }
  }
  return commands
}

function decimalToRgb(color: number): {r: number, g: number, b: number} {
  const r = Math.floor(color / (256*256));
  const g = Math.floor(color / 256) % 256;
  const b = color % 256;
  return {r:r, g:g, b:b}
}