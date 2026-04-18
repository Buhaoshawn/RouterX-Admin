const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, globalShortcut } = require('electron')
const path = require('path')
const http = require('http')
const url = require('url')
const fs = require('fs')

const ADMIN_PORT = 18433
const ADMIN_API = 'http://127.0.0.1:5409'

let mainWindow = null
let tray = null

// 日志
console.log('[Admin] RouterX Admin 启动...')

// =====================
// 静态文件服务器（前端）
// =====================
function startServer(frontendPath) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true)
    const pathname = parsed.pathname

    // API 代理
    if (pathname.startsWith('/api/')) {
      const targetUrl = ADMIN_API + pathname + (parsed.search || '')
      const options = {
        method: req.method,
        headers: {
          ...req.headers,
          'Origin': ADMIN_API,
        }
      }
      // 添加 admin token
      if (!options.headers['X-Admin-Token']) {
        options.headers['X-Admin-Token'] = process.env.ADMIN_TOKEN || 'routerx-admin-secret-2024'
      }
      const proxyReq = http.request(targetUrl, options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, { ...proxyRes.headers, 'Access-Control-Allow-Origin': '*' })
        proxyRes.pipe(res)
      })
      req.pipe(proxyReq)
      return
    }

    // 静态文件
    let filePath = path.join(frontendPath, pathname === '/' ? 'index.html' : pathname)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(frontendPath, 'index.html')
    }
    const ext = path.extname(filePath)
    const mimeTypes = {
      '.html': 'text/html', '.js': 'application/javascript',
      '.css': 'text/css', '.json': 'application/json',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' })
    fs.createReadStream(filePath).pipe(res)
  })

  server.listen(ADMIN_PORT, '127.0.0.1', () => {
    console.log(`[Admin] 前端服务: http://127.0.0.1:${ADMIN_PORT}`)
  })
}

// =====================
// 窗口
// =====================
function createWindow() {
  const { screen } = require('electron')
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    title: 'RouterX Admin'
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.loadURL(`http://127.0.0.1:${ADMIN_PORT}`)

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false))
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide() }
  })

  globalShortcut.register('CommandOrControl+Shift+A', () => {
    mainWindow.show(); mainWindow.focus()
  })
}

// =====================
// 托盘
// =====================
function createTray() {
  const iconPath = path.join(__dirname, 'icon.png')
  let icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('RouterX Admin')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示管理后台', click: () => { mainWindow.show(); mainWindow.focus() } },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit() } }
  ]))
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus() })
}

// =====================
// IPC
// =====================
ipcMain.on('window-minimize', () => mainWindow.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow.hide())
ipcMain.handle('window-is-maximized', () => mainWindow.isMaximized())

// =====================
// 启动
// =====================
app.whenReady().then(() => {
  const frontendPath = path.join(__dirname, '..', 'frontend')
  if (fs.existsSync(frontendPath)) {
    startServer(frontendPath)
  }
  createWindow()
  createTray()
  console.log('[Admin] RouterX Admin 已启动')
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { app.isQuitting = true })
