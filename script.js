// ===================== SUPABASE SETUP =====================
const SUPABASE_URL = "https://oflkibeaesvwzdzyvdfy.supabase.co"; // 🔹 ganti sesuai milikmu
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mbGtpYmVhZXN2d3pkenl2ZGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NDIyOTQsImV4cCI6MjA3MDQxODI5NH0.MMcdx7g54R9kqFdfkDPP57gNPCnxGLKWHhexTAcJ2io"; // 🔹 ganti juga
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener("DOMContentLoaded", async () => {
  const loadingScreen = document.getElementById("loadingScreen");
  const mainContent = document.getElementById("mainContent");
  const form = document.getElementById("santriForm");

  const unitSelect = document.getElementById("unit");
  const namaSelect = document.getElementById("nama");
  const kitabSelect = document.getElementById("kitab");
  const dariSelect = document.getElementById("dariAyat");
  const sampaiSelect = document.getElementById("sampaiAyat");
  const tableBody = document.getElementById("tableBody");
  
document.addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (!th) return;
  const col = th.getAttribute("data-col");
  sortTable(col);
});


  let santriData = [];
  let kitabData = [];
  let baitData = [];
  let currentRows = []; // data global yang sedang ditampilkan
  let currentSort = { column: null, ascending: true };

  // ===================== INIT =====================
  async function init() {
    try {
      loadingScreen.style.display = "flex";
      mainContent.style.display = "none";

      await loadUnits();
	  await loadPenyimak(); 
      await loadKitab();
      await loadData();

      loadingScreen.style.display = "none";
      mainContent.style.display = "block";
    } catch (err) {
      console.error("Init Error:", err);
      alert("Gagal memuat data awal");
    }
  }

  // ===================== LOAD UNITS =====================
  async function loadUnits() {
    const { data, error } = await client
      .from("santri_kharisma")
      .select("Unit_Ndalem")
      .neq("Unit_Ndalem", null);

    if (error) return console.error(error);

    const units = [...new Set(data.map(u => u.Unit_Ndalem))].sort();
    unitSelect.innerHTML = `<option value="">Pilih Unit</option>`;
    units.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      unitSelect.appendChild(opt);
    });
  }

 // ===================== LOAD NAMA SANTRI (tanpa memuat ulang penyimak) =====================
unitSelect.addEventListener("change", async () => {
  const unit = unitSelect.value;

  // NOTE: jangan panggil loadPenyimak di sini karena kita memuat penyimak sekali di init()
  namaSelect.innerHTML = `<option value="">Memuat...</option>`;

  const { data, error } = await client
    .from("santri_kharisma")
    .select("Nama_Lengkap, Kelas, Stambuk")
    .eq("Unit_Ndalem", unit);

  if (error) {
    console.error("Gagal load santri:", error);
    namaSelect.innerHTML = `<option value="">Gagal memuat</option>`;
    return;
  }

  santriData = data;

  // ✅ urutkan santri sesuai urutan kelasOrder
  const sortedData = [...data].sort((a, b) => {
    const aIdx = kelasOrder.indexOf(a.Kelas);
    const bIdx = kelasOrder.indexOf(b.Kelas);
    if (aIdx === -1 && bIdx === -1) return a.Nama_Lengkap.localeCompare(b.Nama_Lengkap);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.Nama_Lengkap.localeCompare(b.Nama_Lengkap);
  });

  namaSelect.innerHTML = `<option value="">Pilih Santri</option>`;
  sortedData.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.Stambuk;
    opt.textContent = `${s.Nama_Lengkap} (${s.Kelas || "-"})`;
    namaSelect.appendChild(opt);
  });
});


  // ===================== LOAD KITAB =====================
async function loadKitab() {
  const { data, error } = await client
    .from("nadhom_kitab")
    .select("id, judul_arab")
    .order("id");

  if (error) {
    console.error("Error load kitab:", error);
    return;
  }

  kitabData = data;
  kitabSelect.innerHTML = `<option value="">Pilih Kitab</option>`; // "Pilih Kitab" dalam Arab

  data.forEach(k => {
    const opt = document.createElement("option");
    opt.value = k.id;
    opt.textContent = k.judul_arab; // hanya teks Arab
    opt.style.fontFamily = "'Scheherazade New', serif";
    opt.style.direction = "rtl";
    kitabSelect.appendChild(opt);
  });
}

kitabSelect.addEventListener("change", async () => {
  const kitabId = kitabSelect.value;
  dariSelect.innerHTML = `<option value="">Memuat...</option>`;
  sampaiSelect.innerHTML = `<option value="">Memuat...</option>`;

  const { data, error } = await client
    .from("nadhom_bait")
    .select("id, nomor_bait, teks_arab")
    .eq("id_kitab", kitabId)
    .order("nomor_bait");

  if (error) return console.error(error);

  baitData = data;
  renderBaitOptions(dariSelect, sampaiSelect, data);
});

// ===================== SIMPAN DATA =====================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const submitBtn = document.getElementById("submitBtn");
  setButtonLoading(submitBtn, true);

  try {
    const stambuk = namaSelect.value;
    const kitab = kitabSelect.value;
    const dari = dariSelect.value || null;
    const sampai = sampaiSelect.value || null;
    const keterangan = document.getElementById("keterangan").value.trim();
    const penyimak = document.getElementById("penyimak").value;

    // Validasi input dasar
    if (!stambuk || !kitab || !dari || !sampai) {
      showNotification("⚠️ Lengkapi semua field sebelum menyimpan.", "error", 4000);
      setButtonLoading(submitBtn, false);
      return;
    }

    // Hitung total ayat (kalau memang berupa urutan, abaikan kalau bukan angka)
    const total = (!isNaN(sampai) && !isNaN(dari)) ? (sampai - dari + 1) : null;

    // Payload yang dikirim ke Supabase
    const payload = {
      stambuk,
      id_kitab: parseInt(kitab),
      dari_ayat: dari,
      sampai_ayat: sampai,
      total_ayat: total,
      id_penyimak: penyimak,
      keterangan,
      tanggal: new Date().toISOString().split("T")[0],
    };

    const { error } = await client.from("setoran_nadhom").insert([payload]);
    if (error) throw error;

    // ✅ Simpan pilihan yang akan dipertahankan
    const selectedUnit = unitSelect.value;
    const selectedPenyimak = document.getElementById("penyimak").value;
    const selectedKitab = kitabSelect.value;

    // Reset hanya field tertentu (bukan semua form)
    namaSelect.innerHTML = `<option value="">Pilih Santri</option>`;
    dariSelect.innerHTML = `<option value="">Pilih Bait</option>`;
    sampaiSelect.innerHTML = `<option value="">Pilih Bait</option>`;
    document.getElementById("keterangan").value = "";

    // ✅ Kembalikan pilihan unit, penyimak, dan kitab sebelumnya
    unitSelect.value = selectedUnit;
    document.getElementById("penyimak").value = selectedPenyimak;
    kitabSelect.value = selectedKitab;

    // Trigger ulang event agar nama santri dan bait terisi kembali
    const event = new Event("change");
    unitSelect.dispatchEvent(event);
    kitabSelect.dispatchEvent(event);

    // ✅ Tampilkan notifikasi sukses
    showNotification("✅ Setoran berhasil disimpan!");

    await loadData();

  } catch (err) {
    console.error("Save error:", err);
    showNotification("❌ Gagal menyimpan setoran: " + (err.message || "Tidak diketahui"), "error", 5000);
  } finally {
    setButtonLoading(submitBtn, false);
  }
});


// ===================== LOAD DATA =====================
async function loadData() {
  const filterSelect = document.getElementById("filterUnit");
  const tableContainer = document.querySelector(".table-container");

  // 1️⃣ Ambil data setoran
  const { data, error } = await client
  .from("setoran_nadhom")
    .select(`
    id, tanggal, total_ayat, keterangan,
    created_at, updated_at,
    id_penyimak,
    santri_kharisma (Nama_Lengkap, Kelas, Unit_Ndalem),
    nadhom_kitab (judul_arab),
    dari_bait:nadhom_bait!fk_dari_bait (id, nomor_bait, teks_arab),
    sampai_bait:nadhom_bait!fk_sampai_bait (id, nomor_bait, teks_arab)
  `)
  .order("tanggal", { ascending: false });


  if (error) {
    console.error(error);
    return;
  }

  // 2️⃣ Ambil daftar penyimak dari view
  const { data: penyimakList, error: errPenyimak } = await client
    .from("penyimak")
    .select("id_penyimak, nama_penyimak");

  if (errPenyimak) console.error("Gagal ambil penyimak:", errPenyimak);

  // 3️⃣ Gabungkan nama penyimak ke data setoran
  const merged = data.map(row => {
    const pen = penyimakList?.find(p => p.id_penyimak === row.id_penyimak);
    return {
      ...row,
      nama_penyimak: pen ? pen.nama_penyimak : "-",
    };
  });

  // 4️⃣ Ambil daftar unit unik
  const allUnits = [...new Set(merged.map(d => d.santri_kharisma?.Unit_Ndalem || "-"))].sort();

  // Isi dropdown filter unit (hanya pertama kali)
  if (filterSelect.options.length === 1) {
    allUnits.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      filterSelect.appendChild(opt);
    });
  }

  const selectedUnit = filterSelect.value || "Semua";
  tableContainer.innerHTML = ""; // kosongkan

  // 5️⃣ Render tabel per unit
  if (selectedUnit === "Semua") {
    allUnits.forEach(unit => {
      const filtered = merged.filter(d => d.santri_kharisma?.Unit_Ndalem === unit);
      tableContainer.innerHTML += renderTable(unit, filtered);
    });
  } else {
    const filtered = merged.filter(d => d.santri_kharisma?.Unit_Ndalem === selectedUnit);
    tableContainer.innerHTML = renderTable(selectedUnit, filtered);
  }

  // Simpan data global untuk sorting
  currentRows = merged;
}

// Event filter
document.getElementById("filterUnit").addEventListener("change", loadData);

// ===================== RENDER TABLE - DIPERBAIKI =====================
function renderTable(unitName, rows) {
  if (!rows || rows.length === 0) {
    return `
      <div class="unit-section">
        <div class="unit-header">${unitName}</div>
        <p class="no-data">Tidak ada data untuk unit ini.</p>
      </div>`;
  }

  // ===== Hitung total akumulasi =====
  const groupedTotals = {};
  const latestDate = {};
  const countByKey = {};

  rows.forEach(r => {
    const nama  = r.santri_kharisma?.Nama_Lengkap || "-";
    const kitab = r.nadhom_kitab?.judul_arab || "-";
    const key   = `${nama}|${kitab}`;
    const tanggal = new Date(r.updated_at || r.created_at || r.tanggal);
    const totalHariIni = Math.abs(parseInt(r.total_ayat) || 0);

    countByKey[key] = (countByKey[key] || 0) + 1;
    groupedTotals[key] = (groupedTotals[key] || 0) + totalHariIni;

    if (!latestDate[key] || tanggal > latestDate[key]) {
      latestDate[key] = tanggal;
    }
  });

  // ===== Buat tabel =====
  let html = `
    <div class="unit-section">
      <div class="unit-header">${unitName}</div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Nama</th>
              <th>Kelas</th>
              <th>Kitab</th>
              <th>Dari</th>
              <th class="lafadz-col">Lafadz</th>
              <th>Sampai</th>
              <th class="lafadz-col">Lafadz</th>
              <th>Setor</th>
              <th>Total</th>
              <th>Tanggal</th>
              <th>Penyimak</th>
              <th>Ket</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>`;

  const shownTotals = {};

  rows.forEach((r, i) => {
    const nama  = r.santri_kharisma?.Nama_Lengkap || "-";
    const kitab = r.nadhom_kitab?.judul_arab || "-";
    const key   = `${nama}|${kitab}`;
    const tanggal = new Date(r.updated_at || r.created_at || r.tanggal);
    const totalHariIni = Math.abs(parseInt(r.total_ayat) || 0);
    const tanggalTerbaru = latestDate[key];
    const isLatest = tanggal.getTime() === tanggalTerbaru.getTime();

    let totalKeseluruhan;
    let showStar = false;

    if (isLatest && !shownTotals[key]) {
      totalKeseluruhan = groupedTotals[key];
      showStar = countByKey[key] > 1;
      shownTotals[key] = true;
    } else {
      totalKeseluruhan = totalHariIni;
    }

    // Format tanggal
    const waktuTampil = r.updated_at || r.created_at;
    let waktuRapi = "-";
    if (waktuTampil) {
      const iso = waktuTampil.slice(0, 16).replace("T", " ");
      const [tanggalPart, waktu] = iso.split(" ");
      const [tahun, bulan, hari] = tanggalPart.split("-");
      waktuRapi = `${hari}/${bulan}/${tahun} ${waktu}`;
    }

    // Render lafadz dengan format yang sesuai berdasarkan kitab
    const lafadzDari = renderLafadz(r.dari_bait?.teks_arab, kitab);
    const lafadzSampai = renderLafadz(r.sampai_bait?.teks_arab, kitab);

    html += `
      <tr ${isLatest ? 'style="background-color:#e8f5e9;"' : ""}>
        <td>${i + 1}</td>
        <td>${nama}</td>
        <td>${r.santri_kharisma?.Kelas || "-"}</td>
        <td class="arabic lafadz-colkitab">${kitab}</td>
        <td>${r.dari_bait?.nomor_bait ?? "-"}</td>
        <td class="lafadz-col">${lafadzDari}</td>
        <td>${r.sampai_bait?.nomor_bait ?? "-"}</td>
        <td class="lafadz-col">${lafadzSampai}</td>
        <td>${totalHariIni}</td>
        <td>${totalKeseluruhan}${showStar ? " *" : ""}</td>
        <td>${waktuRapi}</td>
        <td>${r.nama_penyimak || "-"}</td>
        <td>${r.keterangan || "-"}</td>
        <td>
          <button class="btn-edit" onclick="openEditPopup('${r.id}')">✏️</button>
          <button class="btn-delete" onclick="deleteData('${r.id}')">🗑️</button>
        </td>
      </tr>`;
  });

  html += `
          </tbody>
        </table>
      </div>
    </div>`;

  return html;
}


 // ===============================
//  URUTAN KHUSUS KELAS
// ===============================
const kelasOrder = [
  "SP",
  "V Ibtidaiyah",
  "VI Ibtidaiyah",
  "I Tsanawiyah",
  "II Tsanawiyah",
  "III Tsanawiyah",
  "I Aliyah",
  "II Aliyah",
  "III Aliyah",
  "I-II Ma'had Aly",
  "III-IV Ma'had Aly",
  "V-VI Ma'had Aly"
];


// ===============================
//  SORT TABLE (perbaikan: dukung semua kolom & nested)
//  GANTI seluruh blok sortTable + handler klik header + tombol asc/desc
// ===============================
function computeGroupedTotalsForSorting(rows) {
  const groupedTotals = {};
  rows.forEach(r => {
    const nama = r.santri_kharisma?.Nama_Lengkap || "-";
    const kitab = r.nadhom_kitab?.judul_arab || "-";
    const key = `${nama}|${kitab}`;
    const val = Math.abs(parseInt(r.total_ayat) || 0);
    groupedTotals[key] = (groupedTotals[key] || 0) + val;
  });
  return groupedTotals;
}

function getSortValue(row, column, groupedTotals) {
  // normalize some alias columns
  if (!row) return "";

  // helper key for groupedTotals
  const key = `${row.santri_kharisma?.Nama_Lengkap || "-"}|${row.nadhom_kitab?.judul_arab || "-"}`;

  switch (column) {
    case "Nama_Lengkap":
      return (row.santri_kharisma?.Nama_Lengkap || "").toString();
    case "Kelas":
      return (row.santri_kharisma?.Kelas || "").toString();
    case "judul_arab":
    case "nama_kitab":
      return (row.nadhom_kitab?.judul_arab || "").toString();
    case "dari_ayat":
      // tampilkan nomor_bait jika tersedia, fallback ke dari_ayat (id)
      return row.dari_bait?.nomor_bait ?? row.dari_ayat ?? "";
    case "sampai_ayat":
      return row.sampai_bait?.nomor_bait ?? row.sampai_ayat ?? "";
    case "total_ayat":
      return Number(row.total_ayat) || 0;
    case "totalKeseluruhan":
    case "total_setoran_keseluruhan":
      return Number(groupedTotals[key] || row.total_setoran_keseluruhan || 0) || 0;
    case "tanggal":
    case "created_at":
      return new Date(row.updated_at || row.created_at || row.tanggal || 0).getTime() || 0;
    case "penyimak":
      return (row.nama_penyimak || row.id_penyimak || "").toString();
    case "keterangan":
    case "ket":
      return (row.keterangan || "").toString();
    default:
      // fallback: try nested properties, then direct
      const nested = (
        row.santri_kharisma?.[column] ||
        row.nadhom_kitab?.[column] ||
        row[column]
      );
      return (nested ?? "").toString();
  }
}

function sortTable(column, rows = currentRows) {
  if (!rows || rows.length === 0) return;

  // toggle arah (A-Z ↔ Z-A)
  if (currentSort.column === column) {
    currentSort.ascending = !currentSort.ascending;
  } else {
    currentSort.column = column;
    currentSort.ascending = true;
  }

  // compute grouped totals for columns that need it
  const groupedTotals = computeGroupedTotalsForSorting(rows);

  // special order for kelas
  const isKelas = column === "Kelas";

  // sort
  const sorted = [...rows].sort((a, b) => {
    let aVal = getSortValue(a, column, groupedTotals);
    let bVal = getSortValue(b, column, groupedTotals);

    // Kelas custom order handled separately
    if (isKelas) {
      const aIdx = kelasOrder.indexOf(aVal);
      const bIdx = kelasOrder.indexOf(bVal);
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return currentSort.ascending ? 1 : -1;
      if (bIdx === -1) return currentSort.ascending ? -1 : 1;
      return currentSort.ascending ? aIdx - bIdx : bIdx - aIdx;
    }

    // If both are numbers (or look numeric), compare numerically
    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);
    const bothNumbers = !isNaN(aNum) && !isNaN(bNum);

    if (bothNumbers) {
      return currentSort.ascending ? aNum - bNum : bNum - aNum;
    }

    // fallback to string compare (case-insensitive)
    aVal = (aVal || "").toString().toLowerCase();
    bVal = (bVal || "").toString().toLowerCase();

    if (aVal < bVal) return currentSort.ascending ? -1 : 1;
    if (aVal > bVal) return currentSort.ascending ? 1 : -1;
    return 0;
  });

  // update tampilan header aktif
  document.querySelectorAll("th.sortable").forEach((th) => {
    const col = th.getAttribute("data-col");
    th.classList.remove("sorted-asc", "sorted-desc", "sorted-active");
    if (col === column) {
      th.classList.add(
        currentSort.ascending ? "sorted-asc" : "sorted-desc",
        "sorted-active"
      );
    }
  });

  // render ulang hasil sorting (sama seperti loadData render logic)
  const selectedUnit = document.getElementById("filterUnit").value || "Semua";
  const tableContainer = document.querySelector(".table-container");
  tableContainer.innerHTML = "";

  if (selectedUnit === "Semua") {
    const allUnits = [
      ...new Set(sorted.map((d) => d.santri_kharisma?.Unit_Ndalem || "-"))
    ].sort();

    allUnits.forEach((unit) => {
      const filtered = sorted.filter(
        (d) => d.santri_kharisma?.Unit_Ndalem === unit
      );
      tableContainer.innerHTML += renderTable(unit, filtered);
    });
  } else {
    const filtered = sorted.filter(
      (d) => d.santri_kharisma?.Unit_Ndalem === selectedUnit
    );
    tableContainer.innerHTML = renderTable(selectedUnit, filtered);
  }
}

// Header click handler (single handler, replace any other duplicate handlers)
document.addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (!th) return;
  const column = th.getAttribute("data-col");
  if (!column) return;
  sortTable(column);
});

// Buttons asc/desc using dropdown select
const sortColumnSelect = document.getElementById("sortColumn");
document.getElementById("btnAsc").addEventListener("click", () => {
  const col = sortColumnSelect.value || currentSort.column || "Nama_Lengkap";
  currentSort.column = col;
  currentSort.ascending = true;
  sortTable(col);
});
document.getElementById("btnDesc").addEventListener("click", () => {
  const col = sortColumnSelect.value || currentSort.column || "Nama_Lengkap";
  currentSort.column = col;
  currentSort.ascending = false;
  sortTable(col);
});


  // ===================== BUTTON UTILITY =====================
  function setButtonLoading(btn, loading) {
    const text = btn.querySelector(".btn-text");
    const load = btn.querySelector(".btn-loading");
    text.style.display = loading ? "none" : "inline";
    load.style.display = loading ? "inline" : "none";
    btn.disabled = loading;
  }


// ===================== DELETE DATA =====================
window.deleteData = async function (id) {
  if (!confirm("Yakin ingin menghapus setoran ini?")) return;
  
  const { error } = await client.from("setoran_nadhom").delete().eq("id", id);
  if (error) {
    showNotification("❌ Gagal menghapus setoran", "error", 4000);
    return;
  }
  
  showNotification("🗑️ Setoran berhasil dihapus");
  await loadData();
};

  // ===================== EDIT POPUP =====================
window.openEditPopup = async function (id) {
  const { data, error } = await client
    .from("setoran_nadhom")
	  .select(`
		id, tanggal, total_ayat, keterangan,
		created_at, updated_at,
		id_penyimak,
		santri_kharisma (Nama_Lengkap, Kelas, Unit_Ndalem),
		nadhom_kitab (judul_arab),
		dari_bait:nadhom_bait!fk_dari_bait (id, nomor_bait, teks_arab),
		sampai_bait:nadhom_bait!fk_sampai_bait (id, nomor_bait, teks_arab)
	  `)
    .eq("id", id)
    .single();

  if (error) return console.error(error);

  const modal = document.getElementById("editPopup");
  modal.style.display = "flex";

  document.getElementById("editId").value = id;
  document.getElementById("editNama").value = data.santri_kharisma?.Nama_Lengkap || "";
  document.getElementById("editKelas").value = data.santri_kharisma?.Kelas || "";
  document.getElementById("editKeterangan").value = data.keterangan || "";

  await loadPenyimakToEdit(data.id_penyimak);
  await loadKitabToEdit(data.id_kitab, data.dari_bait?.nomor_bait, data.sampai_bait?.nomor_bait);
};



async function loadKitabToEdit(selectedKitab, dari, sampai) {
  const kitabSelect = document.getElementById("editKitab");
  const dariSel = document.getElementById("editDariAyat");
  const sampaiSel = document.getElementById("editSampaiAyat");

  // isi pilihan kitab
  kitabSelect.innerHTML = `<option value="">Pilih Kitab</option>`;
  kitabData.forEach(k => {
    const opt = document.createElement("option");
    opt.value = k.id;
    opt.textContent = k.judul_arab; // teks Arab
    opt.style.fontFamily = "'Scheherazade New', serif";
    opt.style.direction = "rtl";
    if (k.id === selectedKitab) opt.selected = true;
    kitabSelect.appendChild(opt);
  });

  // ambil bait sesuai kitab terpilih
  const { data, error } = await client
    .from("nadhom_bait")
    .select("nomor_bait, teks_arab")
    .eq("id_kitab", selectedKitab)
    .order("nomor_bait");

  if (error) return console.error(error);

  // ✅ pakai helper: Arab dulu, nomor dalam kurung
  renderBaitOptions(dariSel, sampaiSel, data, dari, sampai);
}

document.getElementById("editKitab").addEventListener("change", async (e) => {
  const kitabId = e.target.value;
  if (!kitabId) return;

  const { data, error } = await client
    .from("nadhom_bait")
    .select("nomor_bait, teks_arab")
    .eq("id_kitab", kitabId)
    .order("nomor_bait");

  if (error) return console.error(error);

  const dariSel = document.getElementById("editDariAyat");
  const sampaiSel = document.getElementById("editSampaiAyat");

  // ✅ isi ulang dengan helper
  renderBaitOptions(dariSel, sampaiSel, data);
});



  // ===================== UPDATE DATA =====================
  document.getElementById("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const submitBtn = document.querySelector("#editForm button[type='submit']");
  setButtonLoading(submitBtn, true);
  
  try {
    const id = document.getElementById("editId").value;
    const dari = document.getElementById("editDariAyat").value || null;
	const sampai = document.getElementById("editSampaiAyat").value || null;
	const penyimak = document.getElementById("editPenyimak").value;
    const total = sampai - dari + 1;

    const payload = {
      id_kitab: document.getElementById("editKitab").value,
      dari_ayat: dari,
      sampai_ayat: sampai,
      total_ayat: total,
	  id_penyimak: penyimak,
      keterangan: document.getElementById("editKeterangan").value,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from("setoran_nadhom").update(payload).eq("id", id);
    if (error) throw error;
    
    showNotification("✏️ Setoran berhasil diperbarui");
    document.getElementById("editPopup").style.display = "none";
    await loadData();
    
  } catch (err) {
    showNotification("❌ Gagal memperbarui setoran", "error", 5000);
  } finally {
    setButtonLoading(submitBtn, false);
  }
});


  document.getElementById("closeEditPopup").onclick = () => {
    document.getElementById("editPopup").style.display = "none";
  };

  // Jalankan init
  init();
});

function renderBaitOptions(dariSel, sampaiSel, data, selectedDari = null, selectedSampai = null) {
  dariSel.innerHTML = `<option value="">Pilih Bait/Ayat Awal</option>`;
  sampaiSel.innerHTML = `<option value="">Pilih Bait/Ayat Akhir</option>`;

  data.forEach(b => {
    const opt1 = document.createElement("option");
    const opt2 = document.createElement("option");

    opt1.value = b.id;
	opt2.value = b.id;

	opt1.textContent = `${b.teks_arab} (${b.nomor_bait})`;
	opt2.textContent = `${b.teks_arab} (${b.nomor_bait})`;


    opt1.classList.add("arabic");
    opt2.classList.add("arabic");

    if (selectedDari && selectedDari === b.nomor_bait) opt1.selected = true;
    if (selectedSampai && selectedSampai === b.nomor_bait) opt2.selected = true;

    dariSel.appendChild(opt1);
    sampaiSel.appendChild(opt2);
  });

  // ✅ aktifkan aturan otomatis dari ↔ sampai
  setupBaitSelection(dariSel, sampaiSel);
}


// ===================== BATAS LOGIKA DARI/SAMPAI =====================
function setupBaitSelection(dariSel, sampaiSel) {
  if (!dariSel || !sampaiSel) return;

  // Saat "Dari Bait" berubah
  dariSel.addEventListener("change", () => {
    const dari = parseInt(dariSel.value);
    if (isNaN(dari)) return;

    // Otomatis isi "Sampai" dengan nilai yang sama
    sampaiSel.value = dari;

    // Filter opsi supaya hanya menampilkan bait >= dari
    for (const opt of sampaiSel.options) {
      if (opt.value && parseInt(opt.value) < dari) {
        opt.disabled = true;
        opt.style.display = "none";
      } else {
        opt.disabled = false;
        opt.style.display = "block";
      }
    }

    // Fokus ke dropdown "Sampai"
    sampaiSel.focus();
  });
}

// ===================== NOTIFICATION FUNCTION =====================
function showNotification(message, type = 'success', duration = 3000) {
  const popup = document.getElementById('notificationPopup');
  const messageEl = document.getElementById('notificationMessage');
  
  // Set message and type
  messageEl.textContent = message;
  popup.className = 'notification-popup';
  popup.classList.add(type);
  
  // Show popup
  popup.classList.add('show');
  
  // Auto hide after duration
  setTimeout(() => {
    popup.classList.remove('show');
  }, duration);
}

// ===================== LOAD PENYIMAK (SEMUA UNIT) =====================
async function loadPenyimak() {
  const penyimakSelect = document.getElementById("penyimak");
  if (!penyimakSelect) return;
  
  penyimakSelect.innerHTML = `<option value="">Memuat...</option>`;

  const { data, error } = await client
    .from("penyimak")
    .select("id_penyimak, nama_penyimak, unit_ndalem")
    .order("nama_penyimak");

  if (error) {
    console.error("Gagal memuat daftar penyimak:", error);
    penyimakSelect.innerHTML = `<option value="">Gagal memuat</option>`;
    return;
  }

  if (!data || data.length === 0) {
    penyimakSelect.innerHTML = `<option value="">(Belum ada penyimak)</option>`;
    return;
  }

  penyimakSelect.innerHTML = `<option value="">Pilih Penyimak</option>`;
  data.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id_penyimak;
    opt.textContent = `${p.nama_penyimak} (${p.unit_ndalem || "-"})`;
    penyimakSelect.appendChild(opt);
  });
}

// ===================== LOAD PENYIMAK UNTUK EDIT POPUP (SEMUA UNIT) =====================
async function loadPenyimakToEdit(selectedId = null) {
  const select = document.getElementById("editPenyimak");
  if (!select) return;

  select.innerHTML = `<option value="">Memuat...</option>`;

  const { data, error } = await client
    .from("penyimak")
    .select("id_penyimak, nama_penyimak, unit_ndalem")
    .order("nama_penyimak");

  if (error) {
    console.error("Gagal memuat daftar penyimak (edit):", error);
    select.innerHTML = `<option value="">Gagal memuat</option>`;
    return;
  }

  if (!data || data.length === 0) {
    select.innerHTML = `<option value="">(Belum ada penyimak)</option>`;
    return;
  }

  select.innerHTML = `<option value="">Pilih Penyimak</option>`;
  data.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id_penyimak;
    opt.textContent = `${p.nama_penyimak} (${p.unit_ndalem || "-"})`;
    if (selectedId && p.id_penyimak === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

// ===================== DAFTAR KITAB NADHOM =====================
const KITAB_NADHOM = [
  "الفية (الأول)",    // Alfiyah I
  "الفية (الثاني)",   // Alfiyah II  
  "العمرطي",                   // Imrithi
  "جوهر المكنون",             // Jauharul Maknun
  "تنوير الحجى"               // Tanwirul Hija
];

// ===================== FUNGSI PEMISAH NADHOM =====================
function splitNadhomText(teksArab) {
  if (!teksArab || teksArab === "-") return null;
  
  // Pattern untuk split nadhom (termasuk semua pemisah yang umum)
  const patterns = [
    /✽/,           // pemisah bintang
    / \.\.\. /,    // ... dengan spasi
    /\.\.\./,      // ... tanpa spasi
    / - /,         // strip dengan spasi
    /-/,           // strip tanpa spasi
    /\./,          // titik satu
    /…/,           // elipsis Arab
    /\s\s+/,       // multiple spaces
  ];
  
  let separator = null;
  let separatorFound = null;
  
  for (const pattern of patterns) {
    const match = teksArab.match(pattern);
    if (match) {
      separator = pattern;
      separatorFound = match[0];
      break;
    }
  }
  
  if (separator && separatorFound) {
    // Split dan hilangkan pemisah dari hasil
    const parts = teksArab.split(separator);
    if (parts.length === 2) {
      return {
        line1: parts[0].trim(),
        line2: parts[1].trim(),
        separator: separatorFound
      };
    } else if (parts.length > 2) {
      // Handle kasus dimana ada multiple separators, ambil bagian pertama dan gabung sisanya
      return {
        line1: parts[0].trim(),
        line2: parts.slice(1).join(' ').trim(),
        separator: separatorFound
      };
    }
  }
  
  // Jika tidak ada separator jelas, coba split di tengah
  const words = teksArab.split(' ');
  if (words.length > 3) {
    const mid = Math.floor(words.length / 2);
    return {
      line1: words.slice(0, mid).join(' '),
      line2: words.slice(mid).join(' '),
      separator: " "
    };
  }
  
  // Jika pendek, tampilkan sebagai single line
  return null;
}

// Fungsi render lafadz berdasarkan jenis kitab
function renderLafadz(teksArab, judulKitab) {
  if (!teksArab || teksArab === "-") return "-";
  
  // Cek apakah kitab ini termasuk nadhom
  const isNadhom = KITAB_NADHOM.includes(judulKitab);
  
  if (isNadhom) {
    const nadhom = splitNadhomText(teksArab);
    if (nadhom && nadhom.line2) {
      // Tampilkan sebagai 2 baris dengan garis pemisah
      return `
        <div class="nadhom-container">
          <div class="nadhom-line">${nadhom.line1}</div>
          <div class="nadhom-divider"></div>
          <div class="nadhom-line">${nadhom.line2}</div>
        </div>
      `;
    }
  }
  
  // Untuk non-nadhom atau nadhom yang tidak bisa di-split
  return `<div class="arabic-single-line">${teksArab}</div>`;
}