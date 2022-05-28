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

const currMatrixState: Array<number> = new Array(256).fill(0)
const message = 0;

LedClient.setStateListener( async (state)=>{
  const mnum = message + 1;
  console.log("received message " + mnum)
  //need to reorder matrix to fit LED matrix ordering
  const newMatrix: Array<Array<number>> = []
  state.forEach((row, idx) => {
    if (idx % 2 != 0) {
      newMatrix.push(row.reverse())
    } else {
      newMatrix.push(row)
    }
  })
  await sync([...currMatrixState], newMatrix.flat().reverse())
  console.log("finished processing message " + mnum)
})

//this might take several seconds. If we are syncing
//while a new state comes in, we can ignore all states except the very latest one. 
async function sync(matrixState: Array<number>, serverState: Array<number>) {
  const commands = diff(matrixState, serverState)
  for (const command of commands) {
    await sendCommand(port, command)
  }
  matrixState = serverState
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