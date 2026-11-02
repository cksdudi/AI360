/**
 * AI 360 — 공통 유틸리티 (QR 코드 생성기, 오프라인 지원 XLSX 입출력, SVG 일러스트, 포맷터)
 */
(function () {
  'use strict';

  /* =========================================================================
   * 1. 고정 시드 난수 생성기 (Mulberry32) — 언제나 동일한 시연용 샘플 결과 보장
   * ========================================================================= */
  function createPRNG(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtNum(n, digits) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
    const num = Number(n);
    if (typeof digits === 'number') return num.toFixed(digits);
    return num.toLocaleString('ko-KR');
  }

  function fmtPct(num, den, digits = 1) {
    if (!den || den <= 0) return '0.0%';
    return ((num / den) * 100).toFixed(digits) + '%';
  }

  function calcDurationHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (Number.isNaN(sh) || Number.isNaN(eh)) return 0;
    const diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
    return diff > 0 ? Math.round((diff / 60) * 10) / 10 : 0;
  }

  /* =========================================================================
   * 2. ISO/IEC 18004 표준 호환 순수 JS QR 코드 생성기 (Version 1~5, ECC-L, Byte Mode)
   *    외부 인터넷 연결 없이도 스마트폰 카메라 스캔 가능한 SVG / PNG DataURL 생성
   * ========================================================================= */
  const QR_VERSIONS = [
    null,
    { v: 1, size: 21, dataBytes: 19, ecBytes: 7, align: [] },
    { v: 2, size: 25, dataBytes: 34, ecBytes: 10, align: [6, 18] },
    { v: 3, size: 29, dataBytes: 55, ecBytes: 15, align: [6, 22] },
    { v: 4, size: 33, dataBytes: 80, ecBytes: 20, align: [6, 26] },
    { v: 5, size: 37, dataBytes: 108, ecBytes: 26, align: [6, 30] }
  ];

  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(ecLen) {
    let poly = [1];
    for (let i = 0; i < ecLen; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const rem = new Uint8Array(ecLen);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ rem[0];
      rem.copyWithin(0, 1);
      rem[ecLen - 1] = 0;
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
    return rem;
  }

  function buildQRMatrix(text) {
    const rawBytes = new TextEncoder().encode(String(text));
    let spec = QR_VERSIONS[5];
    for (let v = 1; v <= 5; v++) {
      if (rawBytes.length + 2 <= QR_VERSIONS[v].dataBytes) {
        spec = QR_VERSIONS[v];
        break;
      }
    }
    const bytes = rawBytes.length + 2 <= spec.dataBytes
      ? rawBytes
      : rawBytes.slice(0, spec.dataBytes - 2);

    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };
    // Byte mode indicator (0100) + 8-bit character count (V1~9)
    pushBits(0b0100, 4);
    pushBits(bytes.length, 8);
    for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);
    const maxBits = spec.dataBytes * 8;
    for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const dataCodewords = new Uint8Array(spec.dataBytes);
    for (let i = 0; i < bits.length / 8; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
      dataCodewords[i] = b;
    }
    const pads = [0xEC, 0x11];
    for (let i = bits.length / 8, p = 0; i < spec.dataBytes; i++, p ^= 1) {
      dataCodewords[i] = pads[p];
    }

    const ecCodewords = rsEncode(dataCodewords, spec.ecBytes);
    const allCodewords = new Uint8Array(spec.dataBytes + spec.ecBytes);
    allCodewords.set(dataCodewords, 0);
    allCodewords.set(ecCodewords, spec.dataBytes);

    const N = spec.size;
    const mat = Array.from({ length: N }, () => new Array(N).fill(null));
    const isFunc = Array.from({ length: N }, () => new Array(N).fill(false));

    const setFunc = (r, c, val) => {
      if (r < 0 || r >= N || c < 0 || c >= N) return;
      mat[r][c] = val ? 1 : 0;
      isFunc[r][c] = true;
    };

    const placeFinder = (top, left) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          setFunc(top + r, left + c, inOuter && (onBorder || inInner));
        }
      }
    };
    placeFinder(0, 0);
    placeFinder(0, N - 7);
    placeFinder(N - 7, 0);

    // Timing patterns
    for (let i = 8; i < N - 8; i++) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }

    // Alignment pattern (V2~V5)
    if (spec.align.length > 0) {
      for (const ar of spec.align) {
        for (const ac of spec.align) {
          if ((ar === 6 && ac === 6) || (ar === 6 && ac === N - 7) || (ar === N - 7 && ac === 6)) continue;
          for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
              const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
              setFunc(ar + r, ac + c, dark);
            }
          }
        }
      }
    }

    // Reserve format areas + dark module
    for (let i = 0; i < 9; i++) {
      if (!isFunc[8][i]) setFunc(8, i, false);
      if (!isFunc[i][8]) setFunc(i, 8, false);
    }
    for (let i = 0; i < 8; i++) {
      setFunc(8, N - 1 - i, false);
      setFunc(N - 1 - i, 8, false);
    }
    setFunc(N - 8, 8, true);

    // Place data bits (zigzag upward/downward)
    let bitIdx = 0;
    const totalBits = allCodewords.length * 8;
    let upward = true;
    for (let right = N - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < N; vert++) {
        const r = upward ? N - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!isFunc[r][c]) {
            let bit = 0;
            if (bitIdx < totalBits) {
              bit = (allCodewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
              bitIdx++;
            }
            // Mask 0: (r + c) % 2 === 0
            if ((r + c) % 2 === 0) bit ^= 1;
            mat[r][c] = bit;
          }
        }
      }
      upward = !upward;
    }

    // Format info for ECC-L (01) + Mask 0 (000) => 0x77c4
    const fmt = 0x77c4;
    const fmtBit = (i) => (fmt >>> i) & 1;
    for (let i = 0; i <= 5; i++) mat[8][i] = fmtBit(14 - i);
    mat[8][7] = fmtBit(8);
    mat[8][8] = fmtBit(7);
    mat[7][8] = fmtBit(6);
    for (let i = 9; i < 15; i++) mat[14 - i][8] = fmtBit(14 - i);

    for (let i = 0; i < 8; i++) mat[8][N - 1 - i] = fmtBit(i);
    for (let i = 0; i < 7; i++) mat[N - 7 + i][8] = fmtBit(14 - i);

    return mat;
  }

  function renderQRSVG(text, sizePx = 156, darkColor = '#0f2942') {
    const mat = buildQRMatrix(text);
    const n = mat.length;
    const quiet = 3;
    const total = n + quiet * 2;
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mat[r][c]) {
          path += `M${c + quiet},${r + quiet}h1v1h-1z`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR Code">
      <rect width="${total}" height="${total}" fill="#ffffff" rx="1.5"/>
      <path d="${path}" fill="${darkColor}"/>
    </svg>`;
  }

  function downloadQRPng(text, filename, titleText, subText) {
    const mat = buildQRMatrix(text);
    const n = mat.length;
    const scale = 12;
    const quiet = 4;
    const qrPx = (n + quiet * 2) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = qrPx + 80;
    canvas.height = qrPx + 150;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#dbe4f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

    ctx.fillStyle = '#0f2942';
    ctx.font = 'bold 20px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((titleText || 'AI 360 QR 코드').slice(0, 28), canvas.width / 2, 52);

    if (subText) {
      ctx.fillStyle = '#475569';
      ctx.font = '14px "Pretendard", "Malgun Gothic", sans-serif';
      ctx.fillText(subText.slice(0, 38), canvas.width / 2, 78);
    }

    const offsetX = 40;
    const offsetY = 92;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mat[r][c]) {
          ctx.fillStyle = '#0f2942';
          ctx.fillRect(offsetX + (c + quiet) * scale, offsetY + (r + quiet) * scale, scale, scale);
        }
      }
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '12px "Pretendard", "Malgun Gothic", sans-serif';
    ctx.fillText('산업통상부 AI 360 · 시연용 샘플 QR', canvas.width / 2, canvas.height - 24);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename || 'ai360_qr.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* =========================================================================
   * 3. 오프라인 호환 XLSX 다운로드 및 업로드 파서 (SheetJS 우선 + 내장 ZIP/XML 폴백)
   * ========================================================================= */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function createZipBlob(filesMap) {
    const enc = new TextEncoder();
    const entries = [];
    let offset = 0;
    for (const [name, content] of Object.entries(filesMap)) {
      const nameBytes = enc.encode(name);
      const dataBytes = content instanceof Uint8Array ? content : enc.encode(content);
      const crc = crc32(dataBytes);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true); // store (no compression)
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0x21, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, dataBytes.length, true);
      lv.setUint32(22, dataBytes.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      entries.push({ nameBytes, dataBytes, crc, localHeader, offset });
      offset += localHeader.length + dataBytes.length;
    }

    const centralParts = [];
    let centralSize = 0;
    for (const e of entries) {
      const ch = new Uint8Array(46 + e.nameBytes.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, e.crc, true);
      cv.setUint32(20, e.dataBytes.length, true);
      cv.setUint32(24, e.dataBytes.length, true);
      cv.setUint16(28, e.nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, e.offset, true);
      ch.set(e.nameBytes, 46);
      centralParts.push(ch);
      centralSize += ch.length;
    }

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const blobParts = [];
    for (const e of entries) {
      blobParts.push(e.localHeader, e.dataBytes);
    }
    for (const ch of centralParts) blobParts.push(ch);
    blobParts.push(eocd);
    return new Blob(blobParts, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  function colLetter(idx) {
    let s = '';
    let n = idx + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function downloadExcel(filename, sheetName, rowsArray) {
    const safeFile = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
    if (!rowsArray || !rowsArray.length) {
      console.warn('downloadExcel: 데이터가 없습니다.');
      return;
    }
    // 객체 배열인 경우 2차원 배열(AOA)로 자동 변환
    if (typeof rowsArray[0] === 'object' && !Array.isArray(rowsArray[0])) {
      const headers = Object.keys(rowsArray[0]);
      const aoa = [headers];
      for (const item of rowsArray) {
        aoa.push(headers.map((h) => item[h] ?? ''));
      }
      rowsArray = aoa;
    }
    if (window.XLSX && window.XLSX.utils) {
      const wb = window.XLSX.utils.book_new();
      const ws = window.XLSX.utils.aoa_to_sheet(rowsArray);
      const colWidths = (rowsArray[0] || []).map((_, ci) => {
        let maxLen = 10;
        for (let r = 0; r < Math.min(rowsArray.length, 80); r++) {
          const val = String((rowsArray[r] && rowsArray[r][ci]) ?? '');
          maxLen = Math.max(maxLen, val.length * 1.8);
        }
        return { wch: Math.min(42, Math.ceil(maxLen)) };
      });
      ws['!cols'] = colWidths;
      window.XLSX.utils.book_append_sheet(wb, ws, (sheetName || 'Sheet1').slice(0, 31));
      window.XLSX.writeFile(wb, safeFile);
      return;
    }

    // 순수 JS OOXML (.xlsx) 생성기 폴백
    const xmlEsc = (v) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    let sheetRowsXml = '';
    for (let r = 0; r < rowsArray.length; r++) {
      const row = rowsArray[r] || [];
      let cellsXml = '';
      for (let c = 0; c < row.length; c++) {
        const ref = `${colLetter(c)}${r + 1}`;
        const val = row[c];
        if (typeof val === 'number' && !Number.isNaN(val)) {
          cellsXml += `<c r="${ref}"><v>${val}</v></c>`;
        } else {
          cellsXml += `<c r="${ref}" t="inlineStr"><is><t>${xmlEsc(val)}</t></is></c>`;
        }
      }
      sheetRowsXml += `<row r="${r + 1}">${cellsXml}</row>`;
    }

    const sName = xmlEsc((sheetName || 'Sheet1').slice(0, 31));
    const files = {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${sName}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
      'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRowsXml}</sheetData>
</worksheet>`
    };

    const blob = createZipBlob(files);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeFile;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    a.remove();
  }

  async function unzipEntries(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    const dec = new TextDecoder('utf-8');
    let eocdPos = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    if (eocdPos < 0) throw new Error('유효한 XLSX(ZIP) 파일이 아닙니다.');
    const count = dv.getUint16(eocdPos + 8, true);
    let cdPos = dv.getUint32(eocdPos + 16, true);
    const out = {};

    for (let i = 0; i < count; i++) {
      if (dv.getUint32(cdPos, true) !== 0x02014b50) break;
      const method = dv.getUint16(cdPos + 10, true);
      const compSize = dv.getUint32(cdPos + 20, true);
      const nameLen = dv.getUint16(cdPos + 28, true);
      const extraLen = dv.getUint16(cdPos + 30, true);
      const commentLen = dv.getUint16(cdPos + 32, true);
      const localOffset = dv.getUint32(cdPos + 42, true);
      const name = dec.decode(bytes.subarray(cdPos + 46, cdPos + 46 + nameLen));
      cdPos += 46 + nameLen + extraLen + commentLen;

      const lNameLen = dv.getUint16(localOffset + 26, true);
      const lExtraLen = dv.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const compData = bytes.subarray(dataStart, dataStart + compSize);

      if (method === 0) {
        out[name] = dec.decode(compData);
      } else if (method === 8 && typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(compData);
        writer.close();
        const buf = await new Response(ds.readable).arrayBuffer();
        out[name] = dec.decode(buf);
      }
    }
    return out;
  }

  function parseCSVText(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.map((line) => {
      const result = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQ = !inQ;
          }
        } else if (ch === ',' && !inQ) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      result.push(cur.trim());
      return result;
    });
  }

  async function parseExcelFile(file) {
    if (file.name.toLowerCase().endsWith('.csv')) {
      const txt = await file.text();
      return parseCSVText(txt);
    }
    const buf = await file.arrayBuffer();
    if (window.XLSX && window.XLSX.read) {
      const wb = window.XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
    }
    // 내장 XLSX XML 파서 폴백
    const files = await unzipEntries(buf);
    const parser = new DOMParser();
    const shared = [];
    if (files['xl/sharedStrings.xml']) {
      const sDoc = parser.parseFromString(files['xl/sharedStrings.xml'], 'application/xml');
      const sis = sDoc.getElementsByTagName('si');
      for (let i = 0; i < sis.length; i++) {
        const ts = sis[i].getElementsByTagName('t');
        let s = '';
        for (let j = 0; j < ts.length; j++) s += ts[j].textContent || '';
        shared.push(s);
      }
    }
    const sheetXml = files['xl/worksheets/sheet1.xml'];
    if (!sheetXml) throw new Error('시트 데이터를 찾을 수 없습니다.');
    const doc = parser.parseFromString(sheetXml, 'application/xml');
    const rowNodes = doc.getElementsByTagName('row');
    const rows = [];
    for (let i = 0; i < rowNodes.length; i++) {
      const cells = rowNodes[i].getElementsByTagName('c');
      const row = [];
      for (let j = 0; j < cells.length; j++) {
        const c = cells[j];
        const ref = c.getAttribute('r') || '';
        const colLetters = ref.replace(/[0-9]/g, '');
        let colIdx = 0;
        for (let k = 0; k < colLetters.length; k++) {
          colIdx = colIdx * 26 + (colLetters.charCodeAt(k) - 64);
        }
        colIdx = colIdx > 0 ? colIdx - 1 : j;
        while (row.length < colIdx) row.push('');

        const t = c.getAttribute('t');
        const vNode = c.getElementsByTagName('v')[0];
        const isNode = c.getElementsByTagName('is')[0];
        let val = '';
        if (t === 's' && vNode) val = shared[parseInt(vNode.textContent, 10)] ?? '';
        else if (t === 'inlineStr' && isNode) val = isNode.textContent || '';
        else if (vNode) val = vNode.textContent || '';
        row[colIdx] = String(val).trim();
      }
      rows.push(row);
    }
    return rows;
  }

  /* =========================================================================
   * 4. 교육 현장 사진용 일러스트형 자리표시자 SVG 생성 (결과보고서용 샘플 이미지)
   * ========================================================================= */
  function createSamplePhotoDataURL(sceneIndex, courseTitle, placeText) {
    const palettes = [
      { bg1: '#eff6ff', bg2: '#dbeafe', accent: '#1d4ed8', sub: '#3b82f6', label: '현장 강의 및 실습 진행' },
      { bg1: '#f0fdf4', bg2: '#dcfce7', accent: '#15803d', sub: '#22c55e', label: '현장 QR 출석 인증 운영' },
      { bg1: '#eef2ff', bg2: '#e0e7ff', accent: '#4338ca', sub: '#6366f1', label: '조별 프롬프트·데이터 실습' },
      { bg1: '#fff7ed', bg2: '#ffedd5', accent: '#c2410c', sub: '#f97316', label: '질의응답 및 업무 적용 토의' }
    ];
    const p = palettes[sceneIndex % palettes.length];
    const safeTitle = esc((courseTitle || 'AI 역량 강화 집합교육').slice(0, 24));
    const safePlace = esc((placeText || '세종청사 교육장').slice(0, 22));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${p.bg1}"/>
          <stop offset="100%" stop-color="${p.bg2}"/>
        </linearGradient>
      </defs>
      <rect width="640" height="400" fill="url(#g)" rx="12"/>
      <rect x="28" y="24" width="584" height="22" rx="6" fill="#ffffff" opacity="0.8"/>
      <text x="42" y="39" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="12" font-weight="700" fill="${p.accent}">[시연용 샘플 현장 일러스트] ${p.label}</text>
      <!-- 대형 스크린 -->
      <rect x="130" y="62" width="380" height="145" rx="8" fill="#ffffff" stroke="${p.accent}" stroke-width="3"/>
      <rect x="148" y="78" width="230" height="18" rx="4" fill="${p.accent}" opacity="0.15"/>
      <text x="158" y="92" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="13" font-weight="700" fill="${p.accent}">${safeTitle}</text>
      <rect x="148" y="108" width="180" height="10" rx="3" fill="#cbd5e1"/>
      <rect x="148" y="126" width="210" height="10" rx="3" fill="#cbd5e1"/>
      <rect x="148" y="144" width="150" height="10" rx="3" fill="#cbd5e1"/>
      <!-- 화면 내 미니 차트/QR -->
      <rect x="405" y="78" width="86" height="86" rx="8" fill="${p.bg1}" stroke="${p.sub}" stroke-width="2"/>
      <rect x="420" y="93" width="20" height="20" fill="${p.accent}"/>
      <rect x="456" y="93" width="20" height="20" fill="${p.accent}"/>
      <rect x="420" y="129" width="20" height="20" fill="${p.accent}"/>
      <rect x="444" y="117" width="14" height="14" fill="${p.sub}"/>
      <text x="448" y="182" text-anchor="middle" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="11" font-weight="700" fill="${p.accent}">AI 360°</text>
      <!-- 강사 -->
      <circle cx="96" cy="175" r="18" fill="${p.accent}"/>
      <path d="M68,232 C68,204 124,204 124,232 Z" fill="${p.accent}"/>
      <!-- 수강생 책상 및 인원 실루엣 -->
      <rect x="70" y="268" width="500" height="12" rx="4" fill="#94a3b8"/>
      <circle cx="150" cy="242" r="15" fill="#334155"/><path d="M126,276 C126,256 174,256 174,276 Z" fill="#475569"/>
      <circle cx="265" cy="242" r="15" fill="#334155"/><path d="M241,276 C241,256 289,256 289,276 Z" fill="#475569"/>
      <circle cx="380" cy="242" r="15" fill="#334155"/><path d="M356,276 C356,256 404,256 404,276 Z" fill="#475569"/>
      <circle cx="495" cy="242" r="15" fill="#334155"/><path d="M471,276 C471,256 519,256 519,276 Z" fill="#475569"/>
      <rect x="45" y="330" width="550" height="44" rx="8" fill="#0f172a" opacity="0.78"/>
      <text x="320" y="350" text-anchor="middle" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="13" font-weight="600" fill="#ffffff">${safePlace} · ${p.label}</text>
      <text x="320" y="367" text-anchor="middle" font-family="Pretendard, Malgun Gothic, sans-serif" font-size="11" fill="#cbd5e1">※ 결과보고서 자동 배치용 시연 샘플 일러스트 자리표시자 (실제 현장 사진 업로드 교체 가능)</text>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* =========================================================================
   * 5. 클립보드 복사 및 토스트 알림
   * ========================================================================= */
  async function copyText(text, successMsg) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      showToast(successMsg || '클립보드에 복사되었습니다.', 'success');
    } catch (e) {
      showToast('복사 중 오류가 발생했습니다.', 'error');
    }
  }

  function showToast(message, type = 'info') {
    let wrap = document.getElementById('toast-container');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toast-container';
      wrap.className = 'toast-container';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = `toast-item toast-${type}`;
    const icon = type === 'success' ? '✓' : type === 'warning' ? '!' : type === 'error' ? '✕' : 'i';
    el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${esc(message)}</span>`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  function exportToXLSX(data, filename, sheetName) {
    if (typeof data === 'string' && typeof filename !== 'string') {
      return downloadExcel(data, sheetName || 'Sheet1', filename);
    }
    return downloadExcel(filename || 'export.xlsx', sheetName || 'Sheet1', data);
  }

  window.AI360Utils = {
    createPRNG,
    esc,
    fmtNum,
    fmtPct,
    calcDurationHours,
    renderQRSVG,
    downloadQRPng,
    downloadExcel,
    exportToXLSX,
    parseExcelFile,
    createSamplePhotoDataURL,
    copyText,
    showToast
  };
})();

