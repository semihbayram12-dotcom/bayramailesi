// src/personData.js
// Bu dosya Draw.io JSON'unu yeni formata DÖNÜŞTÜRÜR.
// Sadece bir kereye mahsustur.

import drawioData from './familyTreeData.json';

// Draw.io JSON'unu yeni "people" formatına dönüştür
function convertToPeople() {
  const cells = drawioData.pages?.[0]?.cells || [];
  const nodesMap = {};
  const edges = [];

  // 1. Önce tüm node'ları topla
  cells.forEach((cell) => {
    if (cell.type === 'node') {
      const isFemale = cell.metadata?.gender === 'K';
      const hasNote = cell.metadata?.NOT === 'T';

      nodesMap[cell.id] = {
        id: cell.id,                      // Orijinal Draw.io ID'si (geçiş için)
        name: cell.label || 'İsimsiz',
        gender: isFemale ? 'female' : 'male',
        parentId: null,                   // Sonra doldurulacak
        soyadi: '',
        anneAdi: '',
        esAdi: '',
        dogumYili: cell.metadata?.dogum || '',
        olumYili: cell.metadata?.olum || '',
        notlar: '',
        notFlag: hasNote,
      };
    } else if (cell.type === 'edge') {
      edges.push({ source: cell.source, target: cell.target });
    }
  });

  // 2. parentId'leri doldur
  edges.forEach((edge) => {
    const child = nodesMap[edge.target];
    if (child) {
      child.parentId = edge.source;
    }
  });

  // 3. Array'e çevir
  return Object.values(nodesMap);
}

export const initialPeople = convertToPeople();