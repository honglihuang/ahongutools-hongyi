// AI 动作启动时与同步拉取后的处理，由 main.tsx 调用（initializeConfig 之后）。
// start：首次写入默认动作（规则见 logic.ts seedDefaultActions），再对账动态指令。
// onDbPull：别的设备可能删改了动作，重新对账。对账失败只记下给设置页显示，不抛错。
import { reconcileCommands, seedActions } from './store.ts'

export async function start(): Promise<void> {
  try {
    await seedActions()
  } finally {
    await reconcileCommands()
  }
}

export async function onDbPull(): Promise<void> {
  await reconcileCommands()
}
