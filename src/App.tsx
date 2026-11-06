// src/App.tsx

import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import Tree from 'react-d3-tree';
import { initialPeople } from './personData';
import { db } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';

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
  anneId?: string;
  anneAdi: string;
  esIds?: string[];
  esAdlari?: string[];
  dogumYili: string;
  olumYili: string;
  notlar: string;
  notFlag: boolean;
  photoUrl?: string;
  loginCode?: string;
}

// ============================================================
// FOTOĞRAFI KÜÇÜLT VE BASE64'E ÇEVİR
// ============================================================
function resizeImageToBase64(
  file: File,
  maxWidth: number = 400,
  maxHeight: number = 400,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas oluşturulamadı'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Fotoğraf yüklenemedi'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
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
// KIZLARI AĞAÇTAN ÇIKAR
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
function getLineage(root: any, targetId: string): { id: string; name: string }[] {
  const path: { id: string; name: string }[] = [];

  function findPath(
    node: any,
    currentPath: { id: string; name: string }[]
  ): boolean {
    if (!node) return false;

    const newPath = [...currentPath, { id: node.id, name: node.name }];

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
// BİR KİŞİNİN TÜM ALT NESİLLERİNİ BUL
// ============================================================
function findAllDescendants(people: Person[], rootId: string): string[] {
  const descendants: string[] = [];
  const stack = [rootId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    const children = people.filter((p) => p.parentId === currentId);
    children.forEach((child) => {
      descendants.push(child.id);
      stack.push(child.id);
    });
  }

  return descendants;
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
// ANNE EKLEME FORMU
// ============================================================
interface AddMotherFormProps {
  personName: string;
  allPeople: Person[];
  currentPerson: Person;
  onAdd: (data: { motherId?: string; motherName?: string }) => void;
  onCancel: () => void;
}

function AddMotherForm({
  personName,
  allPeople,
  currentPerson,
  onAdd,
  onCancel,
}: AddMotherFormProps) {
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const [searchText, setSearchText] = useState('');
  const [manualName, setManualName] = useState('');

  const availableMothers = allPeople.filter((p) => {
    if (p.id === currentPerson.id) return false;
    if (p.gender !== 'female') return false;
    return true;
  });

  const filteredMothers = availableMothers.filter((p) =>
    normalizeText(p.name).includes(normalizeText(searchText))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'search') {
      if (searchText && filteredMothers.length > 0) {
        onAdd({ motherId: filteredMothers[0].id });
      }
    } else {
      if (manualName.trim()) {
        onAdd({ motherName: manualName.trim() });
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>👩 Anne Ekle / Düzenle</h3>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="modal-subtitle">
          <strong>{personName}</strong> kişisinin annesi
        </div>

        <div className="spouse-mode-tabs">
          <button
            type="button"
            className={`spouse-mode-tab ${mode === 'search' ? 'active' : ''}`}
            onClick={() => setMode('search')}
          >
            🔍 Ağaçtan Seç
          </button>
          <button
            type="button"
            className={`spouse-mode-tab ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            ✏️ Manuel Gir
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-form">
          {mode === 'search' ? (
            <>
              <div className="form-row">
                <label>Ağaçta Ara (kadınlar):</label>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Anne adı yazın..."
                  autoFocus
                />
              </div>

              {searchText && (
                <div className="spouse-search-results">
                  {filteredMothers.length === 0 ? (
                    <div className="empty-text">Sonuç bulunamadı</div>
                  ) : (
                    filteredMothers.slice(0, 5).map((mother) => (
                      <div
                        key={mother.id}
                        className="spouse-result-item"
                        onClick={() => onAdd({ motherId: mother.id })}
                      >
                        <span>👩 {mother.name}</span>
                        <small>
                          {mother.soyadi && `(${mother.soyadi})`}
                        </small>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="form-row">
              <label>Anne Adı:</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Örn: ZEKİYE"
                autoFocus
                required
              />
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>
              İptal
            </button>
            {mode === 'manual' && (
              <button type="submit" className="btn-submit">
                ✓ Kaydet
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// EŞ EKLEME FORMU
// ============================================================
interface AddSpouseFormProps {
  personName: string;
  allPeople: Person[];
  currentPerson: Person;
  onAdd: (data: { spouseId?: string; spouseName?: string }) => void;
  onCancel: () => void;
}

function AddSpouseForm({
  personName,
  allPeople,
  currentPerson,
  onAdd,
  onCancel,
}: AddSpouseFormProps) {
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const [searchText, setSearchText] = useState('');
  const [manualName, setManualName] = useState('');

  const availableSpouses = allPeople.filter((p) => {
    if (p.id === currentPerson.id) return false;
    if (currentPerson.esIds?.includes(p.id)) return false;
    return true;
  });

  const filteredSpouses = availableSpouses.filter((p) =>
    normalizeText(p.name).includes(normalizeText(searchText))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'search') {
      if (searchText && filteredSpouses.length > 0) {
        onAdd({ spouseId: filteredSpouses[0].id });
      }
    } else {
      if (manualName.trim()) {
        onAdd({ spouseName: manualName.trim() });
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💍 Eş Ekle</h3>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="modal-subtitle">
          <strong>{personName}</strong> kişisine eş ekleniyor
        </div>

        <div className="spouse-mode-tabs">
          <button
            type="button"
            className={`spouse-mode-tab ${mode === 'search' ? 'active' : ''}`}
            onClick={() => setMode('search')}
          >
            🔍 Ağaçtan Seç
          </button>
          <button
            type="button"
            className={`spouse-mode-tab ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            ✏️ Manuel Gir
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-form">
          {mode === 'search' ? (
            <>
              <div className="form-row">
                <label>Ağaçta Ara:</label>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="İsim yazın..."
                  autoFocus
                />
              </div>

              {searchText && (
                <div className="spouse-search-results">
                  {filteredSpouses.length === 0 ? (
                    <div className="empty-text">Sonuç bulunamadı</div>
                  ) : (
                    filteredSpouses.slice(0, 5).map((spouse) => (
                      <div
                        key={spouse.id}
                        className="spouse-result-item"
                        onClick={() => onAdd({ spouseId: spouse.id })}
                      >
                        <span>
                          {spouse.gender === 'female' ? '👩' : '👨'}{' '}
                          {spouse.name}
                        </span>
                        <small>
                          {spouse.soyadi && `(${spouse.soyadi})`}
                        </small>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="form-row">
              <label>Eş Adı:</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Örn: HAYRİYE"
                autoFocus
                required
              />
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>
              İptal
            </button>
            {mode === 'manual' && (
              <button type="submit" className="btn-submit">
                ✓ Ekle
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
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
// SİLME ONAY FORMU
// ============================================================
interface DeleteConfirmProps {
  personName: string;
  descendantCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirm({
  personName,
  descendantCount,
  onConfirm,
  onCancel,
}: DeleteConfirmProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content delete-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>🗑️ Kişiyi Sil</h3>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="delete-warning">
          <p>
            <strong>"{personName}"</strong> kişisini silmek istediğinizden emin
            misiniz?
          </p>
          {descendantCount > 0 && (
            <div className="delete-descendants-warning">
              ⚠️ Bu kişiyle birlikte <strong>{descendantCount} kişi</strong> daha
              silinecek (alt nesilleri).
            </div>
          )}
          <p className="delete-irreversible">
            Bu işlem geri alınamaz. (JSON yedeğiniz varsa geri yükleyebilirsiniz.)
          </p>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>
            İptal
          </button>
          <button type="button" className="btn-delete" onClick={onConfirm}>
            🗑️ Evet, Sil
          </button>
        </div>
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
  const [showAddSpouseForm, setShowAddSpouseForm] = useState(false);
  const [showAddMotherForm, setShowAddMotherForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [userCode, setUserCode] = useState('');
  const [loggedInPerson, setLoggedInPerson] = useState<Person | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // ADMIN STATE'LERİ
  const [isAdmin, setIsAdmin] = useState(false);
  const ADMIN_CODE = 'admin2026'; // Admin kodunuzu buradan değiştirebilirsiniz

  // ============================================================
  // FIRESTORE'DAN VERİ ÇEKME
  // ============================================================
  useEffect(() => {
    const loadData = async () => {
      try {
        const peopleRef = collection(db, 'people');
        const snapshot = await getDocs(peopleRef);

        if (snapshot.empty) {
          const batch = writeBatch(db);
          initialPeople.forEach((person: Person) => {
            const docRef = doc(db, 'people', person.id);
            batch.set(docRef, person);
          });
          await batch.commit();

          const newSnapshot = await getDocs(peopleRef);
          const loadedPeople: Person[] = [];
          newSnapshot.forEach((docSnapshot) => {
            loadedPeople.push(docSnapshot.data() as Person);
          });
          setPeople(loadedPeople);
        } else {
          const loadedPeople: Person[] = [];
          snapshot.forEach((docSnapshot) => {
            loadedPeople.push(docSnapshot.data() as Person);
          });
          setPeople(loadedPeople);
        }
        setLoading(false);
      } catch (error) {
        console.error('Firestore yükleme hatası:', error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const fullTree = buildTreeFromPeople(people);
  const treeData = showFemales ? fullTree : removeFemales(fullTree);

  const selectedId = selectedMember?.id || '';
  const selectedPerson = people.find((p) => p.id === selectedId);

  const lineage = selectedMember
    ? getLineage(fullTree, selectedMember.id)
    : [];

  const baba = selectedPerson?.parentId
    ? people.find((p) => p.id === selectedPerson.parentId)
    : null;

  const anne = selectedPerson?.anneId
    ? people.find((p) => p.id === selectedPerson.anneId)
    : null;

  const anneDisplay = anne ? anne.name : selectedPerson?.anneAdi || '';

  const descendants = selectedPerson
    ? findAllDescendants(people, selectedPerson.id)
    : [];

  const updatePerson = async (field: keyof Person, value: any) => {
    if (!selectedId || !selectedPerson) return;

    const updatedPerson = { ...selectedPerson, [field]: value };

    try {
      await setDoc(doc(db, 'people', selectedId), updatedPerson);
      setPeople((prev) =>
        prev.map((p) => (p.id === selectedId ? updatedPerson : p))
      );
      setSelectedMember((prev: any) =>
        prev ? { ...prev, [field]: value } : null
      );
    } catch (error) {
      console.error('Firestore güncelleme hatası:', error);
      alert('❌ Kaydetme başarısız!');
    }
  };

  // ============================================================
  // ANNE EKLE / DÜZENLE
  // ============================================================
  const handleAddMother = async (data: {
    motherId?: string;
    motherName?: string;
  }) => {
    if (!selectedPerson) return;

    const updatedPerson = { ...selectedPerson };

    if (data.motherId) {
      updatedPerson.anneId = data.motherId;
      updatedPerson.anneAdi = '';
    } else if (data.motherName) {
      updatedPerson.anneAdi = data.motherName;
      updatedPerson.anneId = '';
    }

    try {
      await setDoc(doc(db, 'people', selectedId), updatedPerson);
      setPeople((prev) =>
        prev.map((p) => (p.id === selectedId ? updatedPerson : p))
      );
      setSelectedMember(updatedPerson);
      setShowAddMotherForm(false);
      alert('✅ Anne bilgisi kaydedildi!');
    } catch (error) {
      console.error('Anne ekleme hatası:', error);
      alert('❌ Anne bilgisi kaydedilemedi!');
    }
  };

  // ============================================================
  // ANNE SİL
  // ============================================================
  const handleRemoveMother = async () => {
    if (!selectedPerson) return;
    if (!confirm('Anne bilgisini silmek istediğinizden emin misiniz?'))
      return;

    const updatedPerson = { ...selectedPerson, anneId: '', anneAdi: '' };

    try {
      await setDoc(doc(db, 'people', selectedId), updatedPerson);
      setPeople((prev) =>
        prev.map((p) => (p.id === selectedId ? updatedPerson : p))
      );
      setSelectedMember(updatedPerson);
    } catch (error) {
      console.error('Anne silme hatası:', error);
      alert('❌ Anne bilgisi silinemedi!');
    }
  };

  // ============================================================
  // EŞ EKLE
  // ============================================================
  const handleAddSpouse = async (data: {
    spouseId?: string;
    spouseName?: string;
  }) => {
    if (!selectedPerson) return;

    const newEsIds = [...(selectedPerson.esIds || [])];
    const newEsAdlari = [...(selectedPerson.esAdlari || [])];

    if (data.spouseId) {
      if (!newEsIds.includes(data.spouseId)) {
        newEsIds.push(data.spouseId);

        const spouse = people.find((p) => p.id === data.spouseId);
        if (spouse) {
          const spouseEsIds = [...(spouse.esIds || [])];
          if (!spouseEsIds.includes(selectedPerson.id)) {
            spouseEsIds.push(selectedPerson.id);
            await setDoc(doc(db, 'people', spouse.id), {
              ...spouse,
              esIds: spouseEsIds,
            });
            setPeople((prev) =>
              prev.map((p) =>
                p.id === spouse.id ? { ...p, esIds: spouseEsIds } : p
              )
            );
          }
        }
      }
    } else if (data.spouseName) {
      if (!newEsAdlari.includes(data.spouseName)) {
        newEsAdlari.push(data.spouseName);
      }
    }

    const updatedPerson = {
      ...selectedPerson,
      esIds: newEsIds,
      esAdlari: newEsAdlari,
    };

    try {
      await setDoc(doc(db, 'people', selectedId), updatedPerson);
      setPeople((prev) =>
        prev.map((p) => (p.id === selectedId ? updatedPerson : p))
      );
      setSelectedMember(updatedPerson);
      setShowAddSpouseForm(false);
      alert('✅ Eş başarıyla eklendi!');
    } catch (error) {
      console.error('Eş ekleme hatası:', error);
      alert('❌ Eş eklenemedi!');
    }
  };

  // ============================================================
  // EŞ SİL
  // ============================================================
  const handleRemoveSpouse = async (
    spouseId?: string,
    spouseName?: string
  ) => {
    if (!selectedPerson) return;

    if (!confirm('Eşi silmek istediğinizden emin misiniz?')) return;

    let newEsIds = [...(selectedPerson.esIds || [])];
    let newEsAdlari = [...(selectedPerson.esAdlari || [])];

    if (spouseId) {
      newEsIds = newEsIds.filter((id) => id !== spouseId);

      const spouse = people.find((p) => p.id === spouseId);
      if (spouse) {
        const spouseEsIds = (spouse.esIds || []).filter(
          (id) => id !== selectedPerson.id
        );
        await setDoc(doc(db, 'people', spouse.id), {
          ...spouse,
          esIds: spouseEsIds,
        });
        setPeople((prev) =>
          prev.map((p) =>
            p.id === spouse.id ? { ...p, esIds: spouseEsIds } : p
          )
        );
      }
    } else if (spouseName) {
      newEsAdlari = newEsAdlari.filter((name) => name !== spouseName);
    }

    const updatedPerson = {
      ...selectedPerson,
      esIds: newEsIds,
      esAdlari: newEsAdlari,
    };

    try {
      await setDoc(doc(db, 'people', selectedId), updatedPerson);
      setPeople((prev) =>
        prev.map((p) => (p.id === selectedId ? updatedPerson : p))
      );
      setSelectedMember(updatedPerson);
    } catch (error) {
      console.error('Eş silme hatası:', error);
      alert('❌ Eş silinemedi!');
    }
  };

  // ============================================================
  // FOTOĞRAF YÜKLE
  // ============================================================
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId || !selectedPerson) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('❌ Fotoğraf 5 MB\'dan küçük olmalı!');
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('❌ Lütfen bir fotoğraf seçin!');
      e.target.value = '';
      return;
    }

    setUploadingPhoto(true);

    try {
      const base64 = await resizeImageToBase64(file, 400, 400, 0.7);

      if (base64.length > 1000000) {
        alert('❌ Fotoğraf çok büyük!');
        setUploadingPhoto(false);
        e.target.value = '';
        return;
      }

      const updatedPerson = { ...selectedPerson, photoUrl: base64 };
      await setDoc(doc(db, 'people', selectedId), updatedPerson);

      setPeople((prev) =>
        prev.map((p) =>
          p.id === selectedId ? { ...p, photoUrl: base64 } : p
        )
      );
      setSelectedMember((prev: any) =>
        prev ? { ...prev, photoUrl: base64 } : null
      );

      alert('✅ Fotoğraf başarıyla yüklendi!');
    } catch (error) {
      console.error('Fotoğraf yükleme hatası:', error);
      alert('❌ Fotoğraf yüklenemedi!');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handlePhotoDelete = async () => {
    if (!selectedPerson?.photoUrl || !selectedId) return;
    if (!confirm('Fotoğrafı silmek istediğinizden emin misiniz?')) return;

    try {
      const updatedPerson = { ...selectedPerson };
      delete updatedPerson.photoUrl;
      await setDoc(doc(db, 'people', selectedId), updatedPerson);

      setPeople((prev) =>
        prev.map((p) =>
          p.id === selectedId ? { ...p, photoUrl: undefined } : p
        )
      );
      setSelectedMember((prev: any) =>
        prev ? { ...prev, photoUrl: undefined } : null
      );

      alert('✅ Fotoğraf silindi!');
    } catch (error) {
      console.error('Fotoğraf silme hatası:', error);
      alert('❌ Fotoğraf silinemedi!');
    }
  };

  const handleAddChild = async (data: {
    name: string;
    gender: 'male' | 'female';
    dogumYili: string;
    soyadi: string;
  }) => {
    if (!selectedPerson) return;

    const newId = `p_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const newPerson: Person = {
      id: newId,
      name: data.name,
      gender: data.gender,
      parentId: selectedPerson.id,
      soyadi: data.soyadi,
      anneId: '',
      anneAdi: '',
      esIds: [],
      esAdlari: [],
      dogumYili: data.dogumYili,
      olumYili: '',
      notlar: '',
      notFlag: false,
    };

    try {
      await setDoc(doc(db, 'people', newId), newPerson);
      setPeople((prev) => [...prev, newPerson]);
      setShowAddForm(false);
      alert(`✅ "${data.name}" başarıyla eklendi!`);
    } catch (error) {
      console.error('Firestore ekleme hatası:', error);
      alert('❌ Ekleme başarısız!');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPerson) return;

    const idsToDelete = [selectedPerson.id, ...descendants];

    try {
      const batch = writeBatch(db);
      idsToDelete.forEach((id) => {
        batch.delete(doc(db, 'people', id));
      });
      await batch.commit();

      setPeople((prev) => prev.filter((p) => !idsToDelete.includes(p.id)));
      setShowDeleteConfirm(false);
      setSelectedMember(null);
      alert(`🗑️ ${idsToDelete.length} kişi silindi.`);
    } catch (error) {
      console.error('Firestore silme hatası:', error);
      alert('❌ Silme başarısız!');
    }
  };

  // ============================================================
  // GİRİŞ FONKSİYONU (ADMIN DESTEKLİ)
  // ============================================================
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Admin kodu kontrolü
    if (userCode === ADMIN_CODE) {
      setIsAdmin(true);
      setIsLoggedIn(true);
      return;
    }

    // 2. Normal kullanıcı kodu kontrolü
    const foundPerson = people.find((p: any) => p.loginCode === userCode);
    if (foundPerson) {
      setLoggedInPerson(foundPerson);
      setIsAdmin(false);
      setIsLoggedIn(true);
    } else {
      alert('❌ Geçersiz kod! Lütfen size verilen kodu girin.');
    }
  };

  const handleBackup = () => {
    const exportData = {
      version: '2.1',
      exportDate: new Date().toISOString(),
      people: people,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const date = new Date().toISOString().split('T')[0];
    link.download = `bayram-ailesi-yedek-${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert(`✅ Yedek alındı! ${people.length} kişi kaydedildi.`);
  };

  const getShortLineage = (person: Person) => {
    if (!fullTree) return '';
    const lineage = getLineage(fullTree, person.id);
    if (lineage.length <= 1) return '';
    if (lineage.length <= 3) {
      return lineage.map((l) => l.name).join(' › ');
    }
    const lastThree = lineage.slice(-3);
    return '... › ' + lastThree.map((l) => l.name).join(' › ');
  };

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
      ? '#FFB74D'
      : isFemale
      ? '#F48FB1'
      : '#80DEEA';

    const strokeColor = isMatch
      ? '#E65100'
      : isFemale
      ? '#AD1457'
      : '#00838F';

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
          fontWeight="500"
          fontFamily="Arial, Helvetica, sans-serif"
          pointerEvents="none"
          style={{
            fontWeight: 500,
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

  const getSpouses = (person: Person) => {
    const spouses: { id?: string; name: string }[] = [];
    (person.esIds || []).forEach((id) => {
      const spouse = people.find((p) => p.id === id);
      if (spouse) spouses.push({ id, name: spouse.name });
    });
    (person.esAdlari || []).forEach((name) => {
      spouses.push({ name });
    });
    return spouses;
  };

  // ============================================================
  // GİRİŞ KONTROLÜ
  // ============================================================

  // 1. Giriş yapılmamışsa Giriş Ekranını göster
  if (!isLoggedIn) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: '#E0F2F1',
        }}
      >
        <form
          onSubmit={handleLogin}
          style={{
            background: 'white',
            padding: '40px',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            width: '320px',
          }}
        >
          <h2 style={{ textAlign: 'center', color: '#00695C', margin: 0 }}>
            🌳 Aile Ağacı
          </h2>
          <p
            style={{
              textAlign: 'center',
              fontSize: '13px',
              color: '#666',
              margin: 0,
            }}
          >
            Size özel gönderilen giriş kodunu girin.
          </p>
          <input
            type="password"
            placeholder="Gizli Kodunuz"
            value={userCode}
            onChange={(e) => setUserCode(e.target.value)}
            required
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: '2px solid #B2DFDB',
              textAlign: 'center',
              fontSize: '18px',
              letterSpacing: '3px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '12px',
              backgroundColor: '#00695C',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '16px',
            }}
          >
            Giriş Yap
          </button>
        </form>
      </div>
    );
  }

  // 2. Giriş yapılmışsa ve hala veriler yükleniyorsa
  if (loading) {
    return (
      <div className="app-container">
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            fontSize: '18px',
            color: '#00695C',
          }}
        >
          ⏳ Veriler yükleniyor...
        </div>
      </div>
    );
  }

  // 3. Giriş yapılmış ve veriler yüklenmişse Ana Uygulama
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left" style={{ position: 'relative' }}>
          <label className="search-label">ARAMA:</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowSearchResults(true);
            }}
            onFocus={() => setShowSearchResults(true)}
            onBlur={() =>
              setTimeout(() => setShowSearchResults(false), 200)
            }
            placeholder="İsim yazın..."
            className="search-input"
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                setShowSearchResults(false);
              }}
              className="clear-button"
            >
              ✕
            </button>
          )}

          {showSearchResults && searchTerm.length > 0 && (
            <div className="search-results-dropdown">
              {people
                .filter((p) =>
                  normalizeText(p.name).includes(normalizeText(searchTerm))
                )
                .slice(0, 10)
                .map((person) => (
                  <div
                    key={person.id}
                    className="search-result-item"
                    onClick={() => {
                      setSelectedMember(person);
                      setShowSearchResults(false);
                    }}
                  >
                    <div className="search-result-name">
                      {person.gender === 'female' ? '👩' : '👨'} {person.name}
                    </div>
                    <div className="search-result-lineage">
                      {getShortLineage(person)}
                    </div>
                  </div>
                ))}
              {people.filter((p) =>
                normalizeText(p.name).includes(normalizeText(searchTerm))
              ).length === 0 && (
                <div className="search-no-results">Sonuç bulunamadı</div>
              )}
            </div>
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

          <button
            className="toggle-button backup"
            onClick={handleBackup}
            title="Tüm verileri JSON olarak yedekle"
          >
            💾 Yedek Al
          </button>

          {/* ÇIKIŞ BUTONU */}
          <button
            className="toggle-button"
            onClick={() => {
              setIsLoggedIn(false);
              setUserCode('');
              setLoggedInPerson(null);
              setIsAdmin(false);
              setSelectedMember(null);
            }}
            style={{ backgroundColor: '#C62828', color: 'white', borderColor: '#C62828' }}
          >
            Çıkış
          </button>
          
          {isAdmin && (
            <span style={{ 
              backgroundColor: '#FFD700', 
              color: '#000', 
              padding: '6px 10px', 
              borderRadius: '4px', 
              fontSize: '11px', 
              fontWeight: 'bold' 
            }}>
              ADMIN
            </span>
          )}
        </div>
      </header>

      <div className="app-canvas">
        <Tree
          data={treeData}
          orientation="horizontal"
          pathFunc="step"
          translate={{ x: 100, y: 400 }}
          zoomable={true}
          panable={true}
          separation={{ siblings: 1, nonSiblings: 1.5 }}
          nodeSize={{ x: 360, y: 60 }}
          scaleExtent={{ min: 0.1, max: 2 }}
          renderCustomNodeElement={renderCustomNode}
        />
      </div>

      {selectedPerson && (() => {
        // YETKİ KONTROLÜ: Admin ise HER KARTI, değilse sadece kendi kartını düzenleyebilir
        const canEdit = isAdmin || loggedInPerson?.id === selectedPerson.id;
        
        return (
          <div className="person-card">
            <div className="person-card-header">
              <div className="photo-container">
                {selectedPerson.photoUrl ? (
                  <div className="photo-wrapper">
                    <img
                      src={selectedPerson.photoUrl}
                      alt={selectedPerson.name}
                      className="person-photo"
                      onClick={() => {
                        if (canEdit) {
                          document.getElementById('photo-upload-input')?.click();
                        }
                      }}
                      style={{ cursor: canEdit ? 'pointer' : 'default' }}
                    />
                    {canEdit && (
                      <button
                        type="button"
                        className="photo-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePhotoDelete();
                        }}
                        title="Fotoğrafı sil"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className="photo-placeholder"
                    onClick={() => {
                      if (canEdit) {
                        document.getElementById('photo-upload-input')?.click();
                      }
                    }}
                    style={{
                      opacity: uploadingPhoto ? 0.5 : 1,
                      cursor: canEdit ? (uploadingPhoto ? 'wait' : 'pointer') : 'default',
                    }}
                  >
                    <span>{uploadingPhoto ? '⏳' : '📷'}</span>
                    <small>
                      {uploadingPhoto ? 'Yükleniyor...' : 'Fotoğraf Ekle'}
                    </small>
                  </div>
                )}
                <input
                  id="photo-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                />
              </div>

              <div className="person-name-container">
                <h2 className="person-name">{selectedPerson.name}</h2>
                {selectedPerson.soyadi && (
                  <p className="person-surname">{selectedPerson.soyadi}</p>
                )}
              </div>

              <button
                className="close-button"
                onClick={() => setSelectedMember(null)}
              >
                ✕
              </button>
            </div>

            <div className="card-section">
              <div className="section-title">📜 SİLSİLE</div>
              <div className="lineage-text">
                {lineage.length > 0 ? (
                  lineage.map((ancestor, index) => (
                    <React.Fragment key={ancestor.id}>
                      <span
                        style={{
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                        onClick={() => {
                          const clickedPerson = people.find(
                            (p) => p.id === ancestor.id
                          );
                          if (clickedPerson) setSelectedMember(clickedPerson);
                        }}
                      >
                        {ancestor.name}
                      </span>
                      {index < lineage.length - 1 && ' › '}
                    </React.Fragment>
                  ))
                ) : (
                  'Silsile yok'
                )}
              </div>
            </div>

            <div className="card-section">
              <div className="section-title">ℹ️ BİLGİLER</div>
              <div className="info-grid">
                <div className="info-row">
                  <span className="info-label">Adı:</span>
                  {canEdit ? (
                    <EditableField
                      value={selectedPerson.name}
                      placeholder="İsim ekle..."
                      onSave={(v) => updatePerson('name', v)}
                    />
                  ) : (
                    <span className="info-value">{selectedPerson.name}</span>
                  )}
                </div>
                <div className="info-row">
                  <span className="info-label">Soyadı:</span>
                  {canEdit ? (
                    <EditableField
                      value={selectedPerson.soyadi}
                      placeholder="Soyadı ekle..."
                      onSave={(v) => updatePerson('soyadi', v)}
                    />
                  ) : (
                    <span className="info-value">
                      {selectedPerson.soyadi || '-'}
                    </span>
                  )}
                </div>
                <div className="info-row">
                  <span className="info-label">Baba Adı:</span>
                  {baba ? (
                    <span
                      className="info-value"
                      style={{
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        color: '#00695C',
                      }}
                      onClick={() => setSelectedMember(baba)}
                    >
                      {baba.name}
                    </span>
                  ) : (
                    <span className="info-value auto">Bilinmiyor</span>
                  )}
                </div>

                {/* ANNE */}
                <div className="info-row">
                  <span className="info-label">Anne Adı:</span>
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'center',
                    }}
                  >
                    {anne ? (
                      <span
                        className="info-value"
                        style={{
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          color: '#00695C',
                        }}
                        onClick={() => setSelectedMember(anne)}
                      >
                        {anne.name}
                      </span>
                    ) : (
                      <span className="info-value editable">
                        {anneDisplay || 'Anne ekle...'}
                      </span>
                    )}
                    {canEdit && (
                      <>
                        <button
                          onClick={() => setShowAddMotherForm(true)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '14px',
                            padding: '0 4px',
                            color: '#00695C',
                          }}
                          title="Anneyi düzenle"
                        >
                          ✏️
                        </button>
                        {anneDisplay && (
                          <button
                            onClick={handleRemoveMother}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '14px',
                              padding: '0 4px',
                              color: '#C62828',
                            }}
                            title="Anneyi sil"
                          >
                            ✕
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="info-row">
                  <span className="info-label">Doğum Yılı:</span>
                  {canEdit ? (
                    <EditableField
                      value={selectedPerson.dogumYili}
                      placeholder="Örn: 1950"
                      onSave={(v) => updatePerson('dogumYili', v)}
                    />
                  ) : (
                    <span className="info-value">
                      {selectedPerson.dogumYili || '-'}
                    </span>
                  )}
                </div>
                <div className="info-row">
                  <span className="info-label">Ölüm Yılı:</span>
                  {canEdit ? (
                    <EditableField
                      value={selectedPerson.olumYili}
                      placeholder="Örn: 2020"
                      onSave={(v) => updatePerson('olumYili', v)}
                    />
                  ) : (
                    <span className="info-value">
                      {selectedPerson.olumYili || '-'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* EŞLERİ */}
            <div className="card-section">
              <div className="section-title">💍 EŞLERİ</div>
              {(() => {
                const spouses = getSpouses(selectedPerson);
                return spouses.length > 0 ? (
                  <div className="children-list">
                    {spouses.map((spouse, index) => (
                      <span
                        key={spouse.id || `name-${index}`}
                        className="child-chip"
                        style={{
                          cursor: spouse.id ? 'pointer' : 'default',
                          backgroundColor: spouse.id ? '#F8BBD0' : '#E0E0E0',
                          color: spouse.id ? '#AD1457' : '#666',
                          position: 'relative',
                          paddingRight: canEdit ? '24px' : '10px',
                        }}
                        onClick={() => {
                          if (spouse.id) {
                            const foundPerson = people.find(
                              (p) => p.id === spouse.id
                            );
                            if (foundPerson) setSelectedMember(foundPerson);
                          }
                        }}
                      >
                        💍 {spouse.name}
                        {canEdit && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSpouse(spouse.id, spouse.name);
                            }}
                            style={{
                              position: 'absolute',
                              right: '4px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: '#C62828',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              width: '16px',
                              height: '16px',
                              fontSize: '10px',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                            title="Eşi sil"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="empty-text">Eş bilgisi yok</div>
                );
              })()}
              {canEdit && (
                <button
                  className="add-button"
                  onClick={() => setShowAddSpouseForm(true)}
                >
                  + Eş Ekle
                </button>
              )}
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
                        onClick={() => {
                          setSelectedMember(child);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {child.gender === 'female' ? '👩' : '👨'} {child.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="empty-text">Ağaçta çocuğu yok</div>
                );
              })()}
              {canEdit && (
                <button
                  className="add-button"
                  onClick={() => setShowAddForm(true)}
                >
                  + Çocuk Ekle
                </button>
              )}
            </div>

            <div className="card-section">
              <div className="section-title">📝 NOTLAR</div>
              {canEdit ? (
                <EditableField
                  value={selectedPerson.notlar}
                  placeholder="Not ekle..."
                  onSave={(v) => updatePerson('notlar', v)}
                />
              ) : (
                <div className="notes-box">
                  {selectedPerson.notlar || 'Not yok'}
                </div>
              )}
            </div>

            {canEdit && (
              <div className="card-actions">
                <button
                  className="delete-button"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  🗑️ Bu Kişiyi Sil
                </button>
              </div>
            )}
            <div className="person-id-display">
              ID: {selectedPerson.id}
            </div>
          </div>
        );
      })()}

      {showAddForm && selectedPerson && (
        <AddChildForm
          parentName={selectedPerson.name}
          onAdd={handleAddChild}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {showAddSpouseForm && selectedPerson && (
        <AddSpouseForm
          personName={selectedPerson.name}
          allPeople={people}
          currentPerson={selectedPerson}
          onAdd={handleAddSpouse}
          onCancel={() => setShowAddSpouseForm(false)}
        />
      )}

      {showAddMotherForm && selectedPerson && (
        <AddMotherForm
          personName={selectedPerson.name}
          allPeople={people}
          currentPerson={selectedPerson}
          onAdd={handleAddMother}
          onCancel={() => setShowAddMotherForm(false)}
        />
      )}

      {showDeleteConfirm && selectedPerson && (
        <DeleteConfirm
          personName={selectedPerson.name}
          descendantCount={descendants.length}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

export default App;