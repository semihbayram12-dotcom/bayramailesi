// src/App.tsx

import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import Tree from 'react-d3-tree';
import { initialPeople } from './personData';

// ============================================================
// TÜRKÇE KARAKTER DESTEKLİ NORMALİZASYON
// ============================================================
const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .replace(/i̇/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();

// ============================================================
// TİP TANIMLARI
// ============================================================
interface Person {
  id: string;
  name: string;
  gender: 'male' | 'female';
  parentId: string | null;
  soyadi: string;
  anneAdi: string;
  esAdi: string;
  dogumYili: string;
  olumYili: string;
  notlar: string;
  notFlag: boolean;
}

// ============================================================
// PEOPLE LİSTESİNİ AĞAÇ YAPISINA DÖNÜŞTÜR
// ============================================================
function buildTreeFromPeople(people: Person[]): any {
  if (!people || people.length === 0) return null;

  const map: Record<string, any> = {};
  people.forEach((p) => {
    map[p.id] = {
      ...p,
      children: [],
    };
  });

  let root = null;
  people.forEach((p) => {
    if (p.parentId && map[p.parentId]) {
      map[p.parentId].children.push(map[p.id]);
    } else if (!p.parentId) {
      root = map[p.id];
    }
  });

  return root;
}

// ============================================================
// KIZLARI AĞAÇTAN ÇIKAR (RECURSIVE)
// ============================================================
function removeFemales(node: any): any {
  if (!node) return null;

  if (node.gender === 'female') {
    return null;
  }

  const filteredChildren = (node.children || [])
    .map((child: any) => removeFemales(child))
    .filter((child: any) => child !== null);

  return {
    ...node,
    children: filteredChildren,
  };
}

// ============================================================
// SİLSİLEYİ HESAPLA
// ============================================================
function getLineage(root: any, targetId: string): string[] {
  const path: string[] = [];

  function findPath(node: any, currentPath: string[]): boolean {
    if (!node) return false;

    const newPath = [...currentPath, node.name];

    if (node.id === targetId) {
      path.push(...newPath);
      return true;
    }

    for (const child of node.children || []) {
      if (findPath(child, newPath)) return true;
    }

    return false;
  }

  findPath(root, []);
  return path;
}

// ============================================================
// ID'DEN KİŞİ BUL
// ============================================================
function findPersonById(root: any, targetId: string): any {
  if (!root || !targetId) return null;
  if (root.id === targetId) return root;

  for (const child of root.children || []) {
    const found = findPersonById(child, targetId);
    if (found) return found;
  }
  return null;
}

// ============================================================
// DÜZENLENEBİLİR ALAN
// ============================================================
interface EditableFieldProps {
  value: string;
  placeholder: string;
  onSave: (newValue: string) => void;
}

function EditableField({ value, placeholder, onSave }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  const handleSave = () => {
    onSave(tempValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setTempValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        autoFocus
        className="editable-input"
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      className={`info-value editable ${!value ? 'empty' : ''}`}
      onClick={() => setIsEditing(true)}
    >
      {value || placeholder}
    </span>
  );
}

// ============================================================
// ÇOCUK EKLEME FORMU
// ============================================================
interface AddChildFormProps {
  parentName: string;
  onAdd: (data: {
    name: string;
    gender: 'male' | 'female';
    dogumYili: string;
    soyadi: string;
  }) => void;
  onCancel: () => void;
}

function AddChildForm({ parentName, onAdd, onCancel }: AddChildFormProps) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [dogumYili, setDogumYili] = useState('');
  const [soyadi, setSoyadi] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Lütfen bir isim girin!');
      return;
    }
    onAdd({ name: name.trim(), gender, dogumYili, soyadi });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>👶 Yeni Çocuk Ekle</h3>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="modal-subtitle">
          <strong>{parentName}</strong> kişisine çocuk ekleniyor
        </div>
        <form onSubmit={handleSubmit} className="add-form">
          <div className="form-row">
            <label>İsim (zorunlu):</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: MEHMET"
              autoFocus
              required
            />
          </div>
          <div className="form-row">
            <label>Cinsiyet:</label>
            <div className="gender-options">
              <label className="gender-option">
                <input
                  type="radio"
                  name="gender"
                  value="male"
                  checked={gender === 'male'}
                  onChange={() => setGender('male')}
                />
                <span>👨 Erkek</span>
              </label>
              <label className="gender-option">
                <input
                  type="radio"
                  name="gender"
                  value="female"
                  checked={gender === 'female'}
                  onChange={() => setGender('female')}
                />
                <span>👩 Kız</span>
              </label>
            </div>
          </div>
          <div className="form-row">
            <label>Doğum Yılı (opsiyonel):</label>
            <input
              type="text"
              value={dogumYili}
              onChange={(e) => setDogumYili(e.target.value)}
              placeholder="Örn: 1950"
            />
          </div>
          <div className="form-row">
            <label>Soyadı (opsiyonel):</label>
            <input
              type="text"
              value={soyadi}
              onChange={(e) => setSoyadi(e.target.value)}
              placeholder="Örn: BAYRAM"
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>
              İptal
            </button>
            <button type="submit" className="btn-submit">
              ✓ Ekle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// ANA UYGULAMA
// ============================================================
function App() {
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFemales, setShowFemales] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // localStorage'dan people listesini yükle
  const [people, setPeople] = useState<Person[]>(() => {
    try {
      const saved = localStorage.getItem('peopleData');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Yoksay
    }
    return initialPeople;
  });

  // people değiştikçe localStorage'a kaydet
  useEffect(() => {
    localStorage.setItem('peopleData', JSON.stringify(people));
  }, [people]);

  // Ağaç yapısını kur
  const fullTree = buildTreeFromPeople(people);
  const treeData = showFemales ? fullTree : removeFemales(fullTree);

  // Seçili kişi
  const selectedId = selectedMember?.id || '';
  const selectedPerson = people.find((p) => p.id === selectedId);

  const lineage = selectedMember
    ? getLineage(fullTree, selectedMember.id)
    : [];

  const babaAdi = selectedPerson?.parentId
    ? findPersonById(fullTree, selectedPerson.parentId)?.name || ''
    : '';

  // Kişi bilgisini güncelle
  const updatePerson = (field: keyof Person, value: string) => {
    if (!selectedId) return;
    setPeople((prev) =>
      prev.map((p) => (p.id === selectedId ? { ...p, [field]: value } : p))
    );
    setSelectedMember((prev: any) =>
      prev ? { ...prev, [field]: value } : null
    );
  };

  // ============================================================
  // YENİ ÇOCUK EKLE
  // ============================================================
  const handleAddChild = (data: {
    name: string;
    gender: 'male' | 'female';
    dogumYili: string;
    soyadi: string;
  }) => {
    if (!selectedPerson) return;

    // Yeni benzersiz ID oluştur
    const newId = `p_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const newPerson: Person = {
      id: newId,
      name: data.name,
      gender: data.gender,
      parentId: selectedPerson.id,
      soyadi: data.soyadi,
      anneAdi: '',
      esAdi: '',
      dogumYili: data.dogumYili,
      olumYili: '',
      notlar: '',
      notFlag: false,
    };

    setPeople((prev) => [...prev, newPerson]);
    setShowAddForm(false);
    alert(`✅ "${data.name}" başarıyla eklendi!`);
  };

  // ============================================================
  // JSON İNDİR
  // ============================================================
  const handleExport = () => {
    const exportData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      people: people,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const date = new Date().toISOString().split('T')[0];
    link.download = `bayram-ailesi-${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ============================================================
  // JSON YÜKLE
  // ============================================================
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const importedData = JSON.parse(content);

        if (!importedData.people || !Array.isArray(importedData.people)) {
          alert(
            'Geçersiz JSON dosyası! Bu dosya bu uygulamadan dışa aktarılmamış olabilir.'
          );
          return;
        }

        setPeople(importedData.people);
        setSelectedMember(null);
        alert(`✅ Başarıyla yüklendi! ${importedData.people.length} kişi.`);
      } catch (err) {
        alert('❌ JSON dosyası okunamadı!');
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ============================================================
  // ÖZEL KUTUCUK
  // ============================================================
  const renderCustomNode = ({ nodeDatum }: any) => {
    const isFemale = nodeDatum.gender === 'female';

    const displayName =
      nodeDatum.name.length > 15
        ? nodeDatum.name.substring(0, 14) + '…'
        : nodeDatum.name;

    const isMatch =
      searchTerm.length > 0 &&
      normalizeText(nodeDatum.name).includes(normalizeText(searchTerm));

    const bgColor = isMatch
    ? '#A5D6A7'
    : isFemale
    ? '#F48FB1'      // Fuşya pembe
    : '#F5B183';

    const strokeColor = isMatch
  ? '#2E7D32'
  : isFemale
  ? '#AD1457'      // Koyu fuşya
  : '#C0622A';
    return (
      <g
        style={{ cursor: 'pointer' }}
        onClick={() => setSelectedMember(nodeDatum)}
      >
        <rect
          x="-75"
          y="-25"
          width="150"
          height="50"
          rx="10"
          ry="10"
          fill={bgColor}
          stroke={strokeColor}
          strokeWidth="2"
        />
        <text
          x="0"
          y="5"
          textAnchor="middle"
          fill="#000000"
          fontSize="16"
          fontWeight="100"
          fontFamily="Arial, Helvetica, sans-serif"
          pointerEvents="none"
          style={{
            fontWeight: 100,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSynthesis: 'none',
          }}
        >
          {displayName}
        </text>

        {nodeDatum.notFlag && (
          <circle
            cx="60"
            cy="-15"
            r="8"
            fill="#FFC107"
            stroke="#F57C00"
            strokeWidth="1.5"
          />
        )}
      </g>
    );
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <label className="search-label">ARAMA:</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="İsim yazın..."
            className="search-input"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="clear-button"
            >
              ✕
            </button>
          )}
        </div>

        <h1 className="header-title">BAYRAM AİLESİ AĞACI</h1>

        <div className="header-right">
          <button
            className="toggle-button"
            onClick={() => setShowFemales(!showFemales)}
          >
            {showFemales ? 'Kız Çocukları Gizle' : 'Kız Çocukları Göster'}
          </button>

          <button className="toggle-button export" onClick={handleExport}>
            📥 İndir
          </button>

          <button
            className="toggle-button import"
            onClick={handleImportClick}
          >
            📤 Yükle
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </header>

      <div className="app-canvas">
        <Tree
          data={treeData}
          orientation="horizontal"
          pathFunc="step"
          translate={{ x: 150, y: 200 }}
          zoomable={true}
          panable={true}
          separation={{ siblings: 1, nonSiblings: 1.5 }}
          nodeSize={{ x: 160, y: 60 }}
          scaleExtent={{ min: 0.1, max: 2 }}
          renderCustomNodeElement={renderCustomNode}
        />
      </div>

      {selectedPerson && (
        <div className="person-card">
          <div className="person-card-header">
            <div className="photo-container">
              <div className="photo-placeholder">
                <span>📷</span>
                <small>Fotoğraf Ekle</small>
              </div>
            </div>
            <button
              className="close-button"
              onClick={() => setSelectedMember(null)}
            >
              ✕
            </button>
          </div>

          <h2 className="person-name">{selectedPerson.name}</h2>

          <div className="card-section">
            <div className="section-title">📜 SİLSİLE</div>
            <div className="lineage-text">
              {lineage.length > 0 ? lineage.join(' › ') : 'Silsile yok'}
            </div>
          </div>

          <div className="card-section">
            <div className="section-title">ℹ️ BİLGİLER</div>
            <div className="info-grid">
              <div className="info-row">
                <span className="info-label">Adı:</span>
                <span className="info-value">{selectedPerson.name}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Soyadı:</span>
                <EditableField
                  value={selectedPerson.soyadi}
                  placeholder="Soyadı ekle..."
                  onSave={(v) => updatePerson('soyadi', v)}
                />
              </div>
              <div className="info-row">
                <span className="info-label">Baba Adı:</span>
                <span className="info-value auto">
                  {babaAdi || 'Bilinmiyor'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Anne Adı:</span>
                <EditableField
                  value={selectedPerson.anneAdi}
                  placeholder="Anne adı ekle..."
                  onSave={(v) => updatePerson('anneAdi', v)}
                />
              </div>
              <div className="info-row">
                <span className="info-label">Eşi:</span>
                <EditableField
                  value={selectedPerson.esAdi}
                  placeholder="Eş ekle..."
                  onSave={(v) => updatePerson('esAdi', v)}
                />
              </div>
              <div className="info-row">
                <span className="info-label">Doğum Yılı:</span>
                <EditableField
                  value={selectedPerson.dogumYili}
                  placeholder="Örn: 1950"
                  onSave={(v) => updatePerson('dogumYili', v)}
                />
              </div>
              <div className="info-row">
                <span className="info-label">Ölüm Yılı:</span>
                <EditableField
                  value={selectedPerson.olumYili}
                  placeholder="Örn: 2020"
                  onSave={(v) => updatePerson('olumYili', v)}
                />
              </div>
            </div>
          </div>

          <div className="card-section">
            <div className="section-title">👶 ÇOCUKLARI</div>
            {(() => {
              const children = people.filter(
                (p) => p.parentId === selectedPerson.id
              );
              return children.length > 0 ? (
                <div className="children-list">
                  {children.map((child) => (
                    <span
                      key={child.id}
                      className={`child-chip ${
                        child.gender === 'female' ? 'female' : 'male'
                      }`}
                    >
                      {child.gender === 'female' ? '👩' : '👨'} {child.name}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="empty-text">Ağaçta çocuğu yok</div>
              );
            })()}
            <button
              className="add-button"
              onClick={() => setShowAddForm(true)}
            >
              + Çocuk Ekle
            </button>
          </div>

          <div className="card-section">
            <div className="section-title">📝 NOTLAR</div>
            <EditableField
              value={selectedPerson.notlar}
              placeholder="Not ekle..."
              onSave={(v) => updatePerson('notlar', v)}
            />
          </div>
        </div>
      )}

      {/* ÇOCUK EKLEME FORMU */}
      {showAddForm && selectedPerson && (
        <AddChildForm
          parentName={selectedPerson.name}
          onAdd={handleAddChild}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

export default App;