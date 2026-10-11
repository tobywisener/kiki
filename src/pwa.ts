export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function installInstructions(userAgent: string, maxTouchPoints = 0) {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  const safari = /Version\/[\d.]+.*Safari\//.test(userAgent) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|OPiOS|Android/.test(userAgent)
  if (ios) return safari ? {
    en: 'Tap Share → Add to Home Screen → Add.',
    th: 'แตะแชร์ → เพิ่มไปยังหน้าจอโฮม → เพิ่ม',
  } : {
    en: 'Open this page in Safari, then tap Share → Add to Home Screen → Add.',
    th: 'เปิดหน้านี้ใน Safari แล้วแตะแชร์ → เพิ่มไปยังหน้าจอโฮม → เพิ่ม',
  }
  if (/Android/.test(userAgent)) return /Chrome\//.test(userAgent) && !/EdgA|SamsungBrowser|OPR/.test(userAgent) ? {
    en: 'Tap the ⋮ menu → Add to Home screen or Install app → Install.',
    th: 'แตะเมนู ⋮ → เพิ่มลงในหน้าจอหลัก หรือติดตั้งแอป → ติดตั้ง',
  } : {
    en: 'Open this page in Chrome, then tap ⋮ → Add to Home screen or Install app → Install.',
    th: 'เปิดหน้านี้ใน Chrome แล้วแตะ ⋮ → เพิ่มลงในหน้าจอหลัก หรือติดตั้งแอป → ติดตั้ง',
  }
  if (safari && /Macintosh/.test(userAgent)) return {
    en: 'In Safari, choose File → Add to Dock → Add.',
    th: 'ใน Safari เลือกไฟล์ → เพิ่มไปยัง Dock → เพิ่ม',
  }
  if (/Chrome\/|Chromium\/|Edg\//.test(userAgent) && !/OPR\//.test(userAgent)) return {
    en: 'Click the install icon in the address bar, then choose Install.',
    th: 'คลิกไอคอนติดตั้งในแถบที่อยู่ แล้วเลือกติดตั้ง',
  }
  return {
    en: 'Open this page in Chrome or Edge, then click the install icon in the address bar.',
    th: 'เปิดหน้านี้ใน Chrome หรือ Edge แล้วคลิกไอคอนติดตั้งในแถบที่อยู่',
  }
}
