/**
 * Gdzie konczy sie kosz ochronny - jedno miejsce dla calej aplikacji.
 *
 * DLACZEGO OSOBNY PLIK
 *
 * Te sama wielkosc liczyly dotad dwa rozne wzory:
 *
 *   - panel (AdminLayout.calculateCageHoops) DOBIERAL liczbe obreczy,
 *     biorac srodek pierwszej obreczy jako "pierwszy szczebel + 1114";
 *   - scena 3D (ThreeCanvas.emitUpdate) POKAZYWALA wynik, liczac dolna
 *     krawedz obreczy z geometrii modelu.
 *
 * Rozjazd wynosil 12 mm przy drabinie klasycznej i z podestem oraz 80 mm
 * przy przelazie attykowym. Petla doboru pilnowala progu 2200 mm wedlug
 * SWOJEGO wzoru, wiec ostatnia obrecz ladowala w przedziale [2200, 2841.7).
 * Wyswietlana wartosc byla o te 12 mm nizsza, wiec gdy dobor trafil w
 * [2200, 2212), panel pokazywal kosz konczacy sie PONIZEJ 2200 mm - czyli
 * sam z siebie wolal o doplate za dluzszy kosz. Przy wysokosciach co 1 cm
 * z zakresu 3-30 m dotyczylo to 52 przypadkow, m.in. rownych 12.00 m.
 *
 * Liczymy wedlug geometrii sceny, bo to ona pokazuje, gdzie obrecz
 * naprawde jest. Mierzymy do DOLNEJ krawedzi obreczy - tego dotyczy
 * wymagany przedzial 2200-3000 mm.
 */

/** Rozstaw obreczy kosza (mm). */
export const ROZSTAW_OBRECZY = 641.7

/** Dopuszczalny przedzial dla dolnej krawedzi ostatniej obreczy (mm). */
export const OBRECZ_MIN_OD_ZIEMI = 2200
export const OBRECZ_MAX_OD_ZIEMI = 3000

/** Wysokosc tasmy obreczy (mm) - stad "dol obreczy" zamiast jej srodka. */
const WYSOKOSC_OBRECZY = 45

/** Pionowa czesc porecz asekuracyjnych (mm). */
const PORECZ_PIONOWA = 1011

/** Wysokosc balustrady przelazu attykowego (mm). */
const PORECZ_ATTYKI = 1650

/** Odleglosc pierwszej obreczy od gory - zalezy od tego, co jest na szczycie. */
const OFFSET_PIERWSZEJ_Z_PORECZA = 25
const OFFSET_PIERWSZEJ_BEZ_PORECZY = 294.3

export type TypPoreczy = 'safety' | 'platform' | 'attic' | 'none'

/**
 * Przesuniecie gory drabiny wzgledem krawedzi sciany (mm).
 * Dokladnie to samo, co ThreeCanvas.positionLadder i renderWallAndGround.
 */
function offsetGory(typPoreczy: TypPoreczy, dystansAttykiMm: number): number {
  if (typPoreczy === 'platform') return -211
  if (typPoreczy === 'attic') return -161 + 511 - dystansAttykiMm
  return -161
}

/**
 * Dolna krawedz n-tej obreczy kosza nad ziemia (mm). Obrecze liczymy od
 * gory, wiec n = 1 to pierwsza obrecz pod szczytem.
 *
 * Wysokosc samej drabiny sie nie liczy: w scenie wystepuje raz w pozycji
 * obreczy i raz w poziomie ziemi, i skraca sie bez reszty. Dlatego nie ma
 * jej wsrod argumentow - inaczej kazdy wolajacy musialby ja liczyc po to,
 * zeby nie mialo to zadnego wplywu na wynik.
 */
export function obreczOdZiemi(opts: {
  numerObreczy: number
  wysokoscScianyMm: number
  typPoreczy: TypPoreczy
  dystansAttykiMm?: number
}): number {
  const { numerObreczy, wysokoscScianyMm, typPoreczy } = opts
  const dystansAttykiMm = opts.dystansAttykiMm ?? 0

  let gora = 0
  let offsetPierwszej = OFFSET_PIERWSZEJ_BEZ_PORECZY
  if (typPoreczy === 'safety' || typPoreczy === 'platform') {
    gora = PORECZ_PIONOWA
    offsetPierwszej = OFFSET_PIERWSZEJ_Z_PORECZA
  } else if (typPoreczy === 'attic') {
    gora = PORECZ_ATTYKI
    offsetPierwszej = OFFSET_PIERWSZEJ_Z_PORECZA
  }

  return wysokoscScianyMm
    + gora
    - offsetPierwszej
    - (numerObreczy - 1) * ROZSTAW_OBRECZY
    - WYSOKOSC_OBRECZY
    - offsetGory(typPoreczy, dystansAttykiMm)
}

/**
 * Ile obreczy zmiesci sie tak, zeby ostatnia nie zeszla ponizej 2200 mm.
 * Ograniczone liczba otworow w modulach drabiny.
 */
export function ileObreczy(opts: {
  wysokoscScianyMm: number
  typPoreczy: TypPoreczy
  dystansAttykiMm?: number
  maksOtworow: number
}): number {
  let n = 0
  while (
    n < opts.maksOtworow &&
    obreczOdZiemi({ ...opts, numerObreczy: n + 1 }) >= OBRECZ_MIN_OD_ZIEMI
  ) {
    n++
  }
  return n
}
