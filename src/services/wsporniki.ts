/**
 * Wspolne dane o wspornikach i kodach produktow.
 *
 * Powstalo z duplikatow: te same tablice stały w ThreeCanvas.vue, AdminLayout.vue
 * i PricedBOM.vue. Przy dokladaniu wspornikow typu C trzeba bylo dopisac te same
 * szesc wpisow w czterech miejscach - stad ten plik.
 */

/** Domyslna odleglosc od sciany (mm) dla kazdego typu wspornika. */
export const WSPORNIK_ODLEGLOSCI_DOMYSLNE: Record<string, number> = {
  krotki: 215,
  sredni: 315,
  dlugi: 415,
  // Typ C - srodek zakresu z nazwy modelu
  typ_c_16_26: 210,
  typ_c_26_36: 310,
  typ_c_36_46: 410,
  typ_c_50_60: 550,
  typ_c_60_70: 650,
  typ_c_70_80: 750
}

/**
 * Granice trasowania po odleglosci (mm) dla rodziny standardowej.
 *
 * Uwaga na domkniecie przedzialu: 260 to jeszcze "krotki", 360 to jeszcze
 * "sredni". Wczesniej byly na to w ThreeCanvas.vue DWIE funkcje o prawie
 * identycznych nazwach, jedna z "<", druga z "<=" - przy rowno 260 mm dawaly
 * rozne wsporniki. Zostaje wariant domkniety, bo taki pokazuje panel.
 */
export function typWspornikaZOdleglosci(odlegloscMm: number): string {
  if (odlegloscMm <= 260) return 'krotki'
  if (odlegloscMm <= 360) return 'sredni'
  return 'dlugi'
}

/**
 * Mapowanie identyfikatora pozycji z listy elementow na kod produktu z cennika.
 *
 * Klucze bez wpisu ida przez fallback "myslniki na podkreslenia" po stronie
 * wolajacego, wiec kod rowny kluczowi nie wymaga tu wiersza.
 */
export const KODY_PRODUKTOW: Record<string, string> = {
  // Drabiny (moduly)
  'ladder_x7': 'drabina_powielana_7',
  'ladder_x8': 'drabina_powielana_7', // X8 uses same price as X7
  'ladder_x1': 'drabina_koncowa_1',
  'ladder_x2': 'drabina_koncowa_2',
  'ladder_x3': 'drabina_koncowa_3',
  'ladder_x4': 'drabina_koncowa_4',
  'ladder_x5': 'drabina_koncowa_5',
  'ladder_x6': 'drabina_koncowa_6',
  'drabina_poczatkowa_7': 'drabina_poczatkowa_7',

  // Laczniki i uchwyty
  'connector_uchwyt': 'uchwyt_montazowo_laczacy',
  'connector_sciskany': 'uchwyt_montazowo_sciskany',
  'module_connector': 'element_laczacy',
  'element_laczacy': 'element_laczacy',

  // Wsporniki
  'wspornik_krotki': 'wspornik_16_26',
  'wspornik_sredni': 'wspornik_26_36',
  'wspornik_dlugi': 'wspornik_36_46',
  // Typ C - klucz z ThreeCanvas jest juz rowny kodowi z cennika, ale wpisujemy
  // go jawnie, zeby nie zalezec od zachowania fallbacku.
  'wspornik_typ_c_16_26': 'wspornik_typ_c_16_26',
  'wspornik_typ_c_26_36': 'wspornik_typ_c_26_36',
  'wspornik_typ_c_36_46': 'wspornik_typ_c_36_46',
  'wspornik_typ_c_50_60': 'wspornik_typ_c_50_60',
  'wspornik_typ_c_60_70': 'wspornik_typ_c_60_70',
  'wspornik_typ_c_70_80': 'wspornik_typ_c_70_80',

  // Porecze
  'handrail': 'porece_asekuracyjne',
  'handrail_connector': 'lacznik_poreczy',

  // Kosz bezpieczenstwa
  'cage_hoop': 'obrecz_kosza',
  'cage_closing': 'blokada_dostepu',
  'angle_bracket_x2': 'katownik_2_otworowy',
  'angle_bracket_x3': 'katownik_3_otworowy',
  'angle_bracket_x4': 'katownik_4_otworowy',

  // Podesty i attyka
  'platform': 'podest_z_poreczami',
  'resting_platform': 'podest_spoczynkowy',
  'attic_passage': 'przejscie_attyka',
  'bigfoot': 'bigfoot',
  'bigfoot_guide': 'prowadnica_bigfoot'
}
