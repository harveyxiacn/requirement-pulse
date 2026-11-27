import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

let electronApp: ElectronApplication
let page: Page
let userDataDir: string
const consoleErrors: string[] = []

test.beforeEach(async () => {
  userDataDir = await mkdtemp(path.join(os.tmpdir(), 'requirement-pulse-e2e-'))
  electronApp = await electron.launch({
    args: [path.resolve('.')],
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      PULSE_USER_DATA_DIR: userDataDir,
      PULSE_DISABLE_SINGLE_INSTANCE: '1'
    }
  })
  page = await electronApp.firstWindow()
  await page.waitForSelector('.board-page')
  await page.waitForFunction(() => document.querySelectorAll('.requirement-card').length > 0)
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
})

test.afterEach(async () => {
  await electronApp.close()
  await rm(userDataDir, { recursive: true, force: true })
  expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([])
  consoleErrors.length = 0
})

test('renders the seeded board at desktop size', async () => {
  await expect(page.getByRole('heading', { name: '需求看板', level: 1 })).toBeVisible()
  await expect(page.getByLabel('需求看板列')).toBeVisible()
  await expect(page.getByText('REQ-001')).toBeVisible()

  await page.screenshot({
    path: 'test-results/screenshots/board-1440x900.png',
    fullPage: false
  })

  const titlebar = page.locator('.titlebar')
  await expect(titlebar).toBeVisible()
  await expect(titlebar.getByText('Requirement Pulse')).toBeVisible()

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 768)
  })
  await page.waitForTimeout(300)
  await page.screenshot({
    path: 'test-results/screenshots/board-1024x768.png',
    fullPage: false
  })
})

test('creates a requirement with the keyboard and opens its detail', async () => {
  await page.keyboard.press('n')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: '记下一条需求' })).toBeVisible()

  await dialog.getByLabel(/标题/).fill('E2E 键盘创建的需求')
  await dialog.getByLabel('需求说明').fill('通过键盘快捷键创建，验证对话框焦点与保存回路。')
  await dialog.getByLabel('验收标准').fill('- [ ] 出现在收件箱\n- [ ] 详情可以打开')
  await dialog.getByRole('button', { name: '创建需求' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'E2E 键盘创建的需求', level: 1 })).toBeVisible()
  await expect(page.getByText('通过键盘快捷键创建，验证对话框焦点与保存回路。')).toBeVisible()
  await page.screenshot({
    path: 'test-results/screenshots/requirement-detail-1440x900.png',
    fullPage: false
  })

  await page.locator('.sidebar-nav').getByRole('link', { name: /需求看板/ }).click()
  const card = page.locator('.requirement-card').filter({ hasText: 'E2E 键盘创建的需求' })
  await expect(card).toBeVisible()
})

test('navigates with the command palette and moves a card via the menu', async () => {
  await page.keyboard.press('Control+K')
  const palette = page.getByRole('dialog')
  await expect(palette).toBeVisible()
  await palette.getByPlaceholder('搜索需求、跳转页面或执行命令…').fill('Agent 值守')
  await palette.getByText('打开 Agent 值守').click()
  await expect(page.getByRole('heading', { name: 'Agent 值守', level: 1 })).toBeVisible()
  await page.screenshot({
    path: 'test-results/screenshots/agent-desk-1440x900.png',
    fullPage: false
  })

  await page.getByRole('link', { name: /需求看板/ }).click()
  await expect(page.getByRole('heading', { name: '需求看板', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: '列表视图' }).click()
  const table = page.locator('.requirement-table')
  await expect(table).toBeVisible()
  const row = table.locator('tr').filter({ hasText: 'REQ-001' })
  await row.getByRole('button', { name: /待验收/ }).click()
  await page.getByRole('menuitem', { name: /进行中/ }).click()
  await expect(page.getByText(/REQ-001 已移到「进行中」/)).toBeVisible()
})

test('has no serious or critical axe violations on the main routes', async () => {
  const scan = async (name: string): Promise<void> => {
    const results = await new AxeBuilder({ page }).setLegacyMode(true).analyze()
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    )
    const summary = blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.slice(0, 4).map((node) => node.target.join(' '))
    }))
    expect(summary, `${name} accessibility violations`).toEqual([])
  }

  await scan('board')
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1024, 768)
  })
  await page.waitForTimeout(300)
  await scan('board-1024')
  await page.getByRole('link', { name: /Agent 值守/ }).click()
  await scan('agents')
  await page.getByRole('link', { name: /活动记录/ }).click()
  await scan('activity')
  await page.getByRole('link', { name: /设置/ }).click()
  await scan('settings')

  await page.getByText('深色工作台', { exact: true }).click()
  await page.waitForTimeout(300)
  await scan('settings-dark')
  await page.getByRole('link', { name: /需求看板/ }).click()
  await scan('board-dark')
  await page.screenshot({
    path: 'test-results/screenshots/board-dark-1024x768.png',
    fullPage: false
  })
})
