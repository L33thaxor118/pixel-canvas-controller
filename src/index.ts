import { SerialPort } from 'serialport'
import LedClient from 'azledclientnode'

class SyncManager {
  private communicator: MatrixCommunicator
  constructor(communicator: MatrixCommunicator) {
    this.communicator = communicator
  }
  private currMatrixState = new Array(256).fill(0)

  enqueueSync(serverState: Array<number>) {
    //deal with enqueueing later. for now just test
    this.sync([...this.currMatrixState], serverState)
  }

  //this might take several seconds
  async sync(matrixState: Array<number>, serverState: Array<number>) {
    const commands = this.diff(matrixState, serverState)
    for (const command of commands) {
      await this.communicator.sendCommand(command)
    }
    this.currMatrixState = matrixState
  }

  private diff(matrixState: Array<number>, serverState: Array<number>): Array<PaintCommand> {
    const commands = []
    for (let i = 0; i < 256; i++) {
      if (matrixState[i] != serverState[i]) {
        const rgb = this.decimalToRgb(serverState[i])
        commands.push({pos: i, r: rgb.r, g: rgb.g, b: rgb.b})
      }
    }
    return commands
  }

  private decimalToRgb(color: number): {r: number, g: number, b: number} {
    const r = Math.floor(color / (256*256));
    const g = Math.floor(color / 256) % 256;
    const b = color % 256;
    return {r:r, g:g, b:b}
  }
}

interface PaintCommand {
  pos: number,
  r: number,
  g: number,
  b: number
}

class MatrixCommunicator {
  private port: SerialPort
  constructor(port: SerialPort) {
    this.port = port
  }
  public async sendCommand(command: PaintCommand): Promise<void> {
    return new Promise<void>((resolve, reject)=>{
      this.port.write(`[${command.pos},${command.r},${command.g},${command.b}]`, (error)=> {
        if (error) {
          reject()
        } else {
          this.port.on('data', (data)=>{
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
}

const manager = new SyncManager(
  new MatrixCommunicator(
    new SerialPort({
      path: '/dev/tty.usbmodem11301',
      baudRate: 9600
    })
  )
)

LedClient.setStateListener((state)=>{
  //need to reorder matrix to fit LED matrix ordering
  const newMatrix: Array<Array<number>> = []
  state.forEach((row, idx) => {
    if (idx % 2 != 0) {
      newMatrix.push(row.reverse())
    } else {
      newMatrix.push(row)
    }
  })
  manager.enqueueSync(newMatrix.flat().reverse())
})