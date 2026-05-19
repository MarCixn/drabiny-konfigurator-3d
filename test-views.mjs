import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'http://localhost:5173'
const SCREENSHOT_DIR = './test-screenshots'

const delay = ms => new Promise(r => setTimeout(r, ms))

async function runTests() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  }

  console.log('Starting browser...')
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 }
  })

  const page = await browser.newPage()

  // Enable console logging from the page
  page.on('console', msg => {
    if (msg.type() === 'log') console.log('PAGE:', msg.text())
  })

  console.log('Loading configurator...')
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 })
  await delay(2000)

  // Step 1: Click "Zewnetrzna"
  console.log('Selecting external ladder...')
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.choice-card')
    for (const card of cards) {
      if (card.textContent.includes('Zewn')) {
        card.click()
        return true
      }
    }
    return false
  })
  await delay(1500)

  // Step 2: Click "Klasyczna" (bez podestu)
  console.log('Selecting scheme...')
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.choice-card')
    for (const card of cards) {
      if (card.textContent.includes('Klasyczna') || card.textContent.includes('poręcz')) {
        card.click()
        return true
      }
    }
    // Click first card as fallback
    if (cards.length > 0) cards[0].click()
    return false
  })
  await delay(2000)

  console.log('On main configurator...')

  // Test configurations - include higher suspended height
  const tests = [
    { name: '01_basic_5m', wallHeight: 5, suspended: false },
    { name: '02_suspended_5m_3m', wallHeight: 5, suspended: true, suspHeight: 3 },
    { name: '03_basic_8m', wallHeight: 8, suspended: false },
    { name: '04_suspended_8m_3m', wallHeight: 8, suspended: true, suspHeight: 3 },
  ]

  const views = ['side', 'front', 'back']

  for (const test of tests) {
    console.log(`\n=== ${test.name} ===`)

    // First, disable suspended if needed
    await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]')
      for (const cb of checkboxes) {
        const container = cb.closest('label, .form-group, .checkbox-group')
        if (!container) continue
        const text = container.textContent || ''
        if (text.includes('Zawiesz') || text.includes('zawieszona')) {
          if (cb.checked) {
            cb.click()
            console.log('Disabled suspended')
          }
          break
        }
      }
    })
    await delay(500)

    // Set wall height
    console.log(`  Setting wall height to ${test.wallHeight}m...`)
    await page.evaluate((h) => {
      const inputs = document.querySelectorAll('input[type="number"]')
      for (const input of inputs) {
        const container = input.closest('.form-group')
        if (!container) continue
        const label = container.querySelector('label')
        if (label && (label.textContent.includes('ściany') || label.textContent.includes('Wysokość ściany'))) {
          input.value = h
          input.dispatchEvent(new Event('input', { bubbles: true }))
          console.log('Set wall height to ' + h)
          break
        }
      }
    }, test.wallHeight)
    await delay(1000)

    // Enable suspended if needed
    if (test.suspended) {
      console.log(`  Enabling suspended at ${test.suspHeight}m...`)

      // Click the suspended checkbox
      await page.evaluate(() => {
        const checkboxes = document.querySelectorAll('input[type="checkbox"]')
        for (const cb of checkboxes) {
          const container = cb.closest('label, .form-group, .checkbox-group')
          if (!container) continue
          const text = container.textContent || ''
          if (text.includes('Zawiesz') || text.includes('zawieszona')) {
            if (!cb.checked) {
              cb.click()
              console.log('Enabled suspended checkbox')
            }
            break
          }
        }
      })
      await delay(800)

      // Set suspended height
      await page.evaluate((h) => {
        const inputs = document.querySelectorAll('input[type="number"]')
        for (const input of inputs) {
          const container = input.closest('.form-group')
          if (!container) continue
          const label = container.querySelector('label')
          if (label && label.textContent.includes('zawieszenia')) {
            input.value = h
            input.dispatchEvent(new Event('input', { bubbles: true }))
            console.log('Set suspended height to ' + h)
            break
          }
        }
      }, test.suspHeight)
      await delay(1000)
    }

    // Wait for model to update
    await delay(1500)

    // Click tech drawing button
    console.log('  Enabling tech drawing mode...')
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button')
      for (const btn of buttons) {
        const title = btn.title || ''
        if (title.includes('Rysunek') || title.includes('techniczny')) {
          btn.click()
          console.log('Clicked tech drawing button: ' + title)
          return true
        }
      }
      // Try by class
      const toolBtns = document.querySelectorAll('.tool-btn, .toolbar-btn')
      for (const btn of toolBtns) {
        if (btn.title?.includes('Rysunek')) {
          btn.click()
          return true
        }
      }
      return false
    })
    await delay(2000)

    // Test each view
    for (const targetView of views) {
      console.log(`  View: ${targetView}`)

      // Switch to target view
      for (let i = 0; i < 5; i++) {
        const currentView = await page.evaluate(() => {
          const panel = document.getElementById('techDrawingPanel')
          if (!panel) return 'no-panel'
          const viewSpan = panel.querySelector('.tech-view')
          return viewSpan?.textContent?.toLowerCase() || ''
        })

        if (currentView.includes(targetView)) break

        await page.evaluate(() => {
          const btn = document.querySelector('.tech-switch-btn')
          if (btn) btn.click()
        })
        await delay(600)
      }

      await delay(1000)

      // Take screenshot
      const filename = `${test.name}_${targetView}.png`
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename) })
      console.log(`    Saved: ${filename}`)
    }

    // Exit tech drawing mode
    await page.evaluate(() => {
      const btn = document.querySelector('.tech-close-btn')
      if (btn) btn.click()
    })
    await delay(500)
  }

  console.log('\n=== Done! ===')
  await browser.close()
}

runTests().catch(console.error)
