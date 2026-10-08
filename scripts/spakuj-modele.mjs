/**
 * Pakuje modele .glb do .glb.gz obok oryginałów.
 *
 * Po co: LiteSpeed nie kompresuje plików .glb w locie (typ spoza jego listy),
 * więc podajemy mu gotowe. Serwer podmienia je przez regułę w public/.htaccess,
 * a przeglądarka rozpakowuje sama — kod konfiguratora o niczym nie wie.
 *
 * Zysk na komplecie modeli: 8376 KB -> 2070 KB.
 *
 *   node scripts/spakuj-modele.mjs
 *
 * URUCHOM PONOWNIE po każdej podmianie modelu — inaczej serwer poda starą
 * wersję z .gz, a nowego .glb nikt nie zobaczy.
 */
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

const katalog = path.join(process.cwd(), 'public', 'models')

if (!fs.existsSync(katalog)) {
  console.error('nie ma katalogu ' + katalog)
  process.exit(1)
}

const modele = fs.readdirSync(katalog).filter((f) => f.endsWith('.glb'))
if (!modele.length) {
  console.error('brak plikow .glb w ' + katalog)
  process.exit(1)
}

let przed = 0
let po = 0
let pominietych = 0

for (const nazwa of modele) {
  const zrodlo = path.join(katalog, nazwa)
  const cel = zrodlo + '.gz'

  // Nie pakujemy drugi raz tego samego - liczy sie czas modyfikacji
  if (fs.existsSync(cel) && fs.statSync(cel).mtimeMs >= fs.statSync(zrodlo).mtimeMs) {
    przed += fs.statSync(zrodlo).size
    po += fs.statSync(cel).size
    pominietych++
    continue
  }

  const dane = fs.readFileSync(zrodlo)
  const spakowane = zlib.gzipSync(dane, { level: 9 })
  fs.writeFileSync(cel, spakowane)

  przed += dane.length
  po += spakowane.length
  console.log(`  ${nazwa.padEnd(34)} ${String(Math.round(dane.length / 1024)).padStart(5)} KB -> ${String(Math.round(spakowane.length / 1024)).padStart(5)} KB`)
}

const kb = (b) => Math.round(b / 1024)
console.log('')
console.log(`  modeli: ${modele.length}${pominietych ? ` (bez zmian: ${pominietych})` : ''}`)
console.log(`  razem:  ${kb(przed)} KB -> ${kb(po)} KB  (mniej o ${kb(przed - po)} KB, ${Math.round(100 - (100 * po) / przed)}%)`)
