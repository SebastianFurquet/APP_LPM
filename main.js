// =====================================================
// 0) VARIABLES GLOBALES / ESTADO
// =====================================================

// tarifas base
const CHAPA_BASE = 50000; // valor hora / módulo de chapa
const PINTURA_BASE = 60000; // valor hora / módulo de pintura

// listas de vehículos (marca/modelo/versión)
let vehiculos = [];

// listas de ratios por sector
let trasero = [];
let delantero = [];
let lateral = [];

// segmento actual del vehículo elegido (ej "MM2")
let segmentoVehiculoSeleccionado = null;

// daños actualmente seleccionados en la grilla, para totales acumulados
// clave -> { manoObra, pintura, total }
// ejemplo clave: "trasero|BAUL|repara"
const itemsSeleccionados = {};

// =====================================================
// 1) HELPERS GENERALES
// =====================================================

// saca duplicados de un array plano
function unique(list) {
    return [...new Set(list)];
}

// rellena un <select> con opciones y placeholder al principio
function fillSelect(selectEl, valuesArray, placeholderText) {
    // limpio
    selectEl.innerHTML = "";

    // placeholder
    const optPlaceholder = document.createElement("option");
    optPlaceholder.value = "";
    optPlaceholder.textContent = placeholderText;
    optPlaceholder.disabled = true;
    optPlaceholder.selected = true;
    selectEl.appendChild(optPlaceholder);

    // opciones reales
    valuesArray.forEach((val) => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        selectEl.appendChild(opt);
    });

    // refrescar Select2 en ese select
    $("#" + selectEl.id).trigger("change.select2");
}

// mapea "MM0"/"MM1"/"MM2"/"MM3" → número de segmento
// MM0 → 0 (motos)
// MM1 → 1 (autos)
// MM2 → 2 (SUV)
// MM3 → 3 (pick-up)
function segmentCodeFromLabel(segmentoLabel) {
    const mapa = {
        MM0: 0,
        MM1: 1,
        MM2: 2,
        MM3: 3,
    };
    return mapa[segmentoLabel];
}

// formatea en ARS
function fmtARS(n) {
    return n.toLocaleString("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

// normaliza la estructura de cada fila de ratios
// para que todos los JSON queden { seg, repuesto, ratioMO, ratioP }
function normalizarLista(listaOriginal) {
    return listaOriginal.map((item) => ({
        seg: item["SEG"] ?? item["SEG."], // algunos archivos usan "SEG." con punto
        repuesto: item["REPUESTO"],
        ratioMO: item["RATIO M.O."],
        ratioP: item["RATIO P."],
    }));
}

// devuelve la lista correcta según el sector
// sector = "trasero" | "delantero" | "lateral"
function getListaPorSector(sector) {
    if (sector === "trasero") return trasero;
    if (sector === "delantero") return delantero;
    if (sector === "lateral") return lateral;
    return [];
}

// =====================================================
// 2) MANEJO DE VEHÍCULO (Marca / Modelo / Versión)
// =====================================================

// referenciamos elementos del DOM relacionados al vehículo
const selectMarca = document.getElementById("selectMarca");
const selectModelo = document.getElementById("selectModelo");
const selectVersion = document.getElementById("selectVersion");

const boxResultado = document.getElementById("resultado");
const outMarca = document.getElementById("outMarca");
const outModelo = document.getElementById("outModelo");
const outVersion = document.getElementById("outVersion");
const outCodVehiculo = document.getElementById("outCodVehiculo");
const outSegmento = document.getElementById("outSegmento");
const outGama = document.getElementById("outGama");

// inicializa los selects de marca/modelo/versión
function initVehiculos() {
    const marcas = unique(vehiculos.map((v) => v.marca)).sort();
    fillSelect(selectMarca, marcas, "Elegí una marca...");

    // estado inicial
    selectModelo.disabled = true;
    selectVersion.disabled = true;

    // activar Select2 en los 3 selects
    $("#selectMarca").select2({
        theme: "bootstrap4",
        width: "100%",
        placeholder: "Elegí una marca...",
        dropdownParent: $("#selectMarca").parent(),
    });

    $("#selectModelo").select2({
        theme: "bootstrap4",
        width: "100%",
        placeholder: "Elegí un modelo...",
        dropdownParent: $("#selectModelo").parent(),
    });

    $("#selectVersion").select2({
        theme: "bootstrap4",
        width: "100%",
        placeholder: "Elegí una versión...",
        dropdownParent: $("#selectVersion").parent(),
    });
}

// cuando cambio la marca
$("#selectMarca").on("change", function () {
    const marcaSeleccionada = this.value;

    const modelosUnicos = unique(
        vehiculos.filter((v) => v.marca === marcaSeleccionada).map((v) => v.modelo)
    ).sort();

    fillSelect(selectModelo, modelosUnicos, "Elegí un modelo...");

    selectModelo.disabled = false;
    selectVersion.disabled = true;

    fillSelect(selectVersion, [], "Primero elegí modelo...");

    boxResultado.style.display = "none";
});

// cuando cambio el modelo
$("#selectModelo").on("change", function () {
    const marcaSeleccionada = selectMarca.value;
    const modeloSeleccionado = this.value;

    const versionesUnicas = unique(
        vehiculos
            .filter(
                (v) => v.marca === marcaSeleccionada && v.modelo === modeloSeleccionado
            )
            .map((v) => v.version)
    ).sort();

    fillSelect(selectVersion, versionesUnicas, "Elegí una versión...");

    selectVersion.disabled = false;
    boxResultado.style.display = "none";
});

// cuando cambio la versión
$("#selectVersion").on("change", function () {
    const marcaSel = selectMarca.value;
    const modeloSel = selectModelo.value;
    const versionSel = this.value;

    // buscamos el registro completo del vehículo elegido
    const match = vehiculos.find(
        (v) =>
            v.marca === marcaSel && v.modelo === modeloSel && v.version === versionSel
    );

    // mostramos info del vehículo elegido
    outMarca.textContent = marcaSel;
    outModelo.textContent = modeloSel;
    outVersion.textContent = versionSel;
    outCodVehiculo.textContent = match ? match.codVehiculo ?? "-" : "-";
    outSegmento.textContent = match ? match.segmento ?? "-" : "-";
    outGama.textContent = match ? match.gama ?? "-" : "-";

    boxResultado.style.display = "block";

    // guardamos el segmento en memoria para usar en el cálculo de MO/Pintura
    // ej "MM2"
    segmentoVehiculoSeleccionado = match ? match.segmento : null;
});

// =====================================================
// 3) CARGA DE DATOS DESDE JSON
// =====================================================

// 3.1) Cargar vehículos desde LPM_SEGMENTOS.json
fetch("./LPM_SEGMENTOS.json")
    .then((res) => res.json())
    .then((data) => {
        vehiculos = data.map((item) => ({
            marca: item.CyC_desc_marca,
            modelo: item.CyC_desc_modelo,
            version: item.CyC_desc_version,
            codVehiculo: item.CyC_cod_vehiculo,
            segmento: item.segmento, // ej "MM2"
            gama: item.gama,
        }));

        initVehiculos();
    });

// 3.2) Cargar ratios de reparación (trasero/delantero/lateral)
Promise.all([
    fetch("./trasero.json").then((res) => res.json()),
    fetch("./delantero.json").then((res) => res.json()),
    fetch("./lateral.json").then((res) => res.json()),
])
    .then(([dataTrasero, dataDelantero, dataLateral]) => {
        trasero = normalizarLista(dataTrasero);
        delantero = normalizarLista(dataDelantero);
        lateral = normalizarLista(dataLateral);

        console.log("✅ Ratios cargados:", { trasero, delantero, lateral });

        // una vez que tenemos los datos de ratios,
        // podemos poblar el combo de repuestos según el sector actual
        //poblarRepuestos();

        // también podemos enganchar listeners a los checkboxes de daños
        attachListenersDanios();
    })
    .catch((err) => {
        console.error("❌ Error al cargar los archivos JSON de ratios:", err);
    });

// =====================================================
// 4) CÁLCULO DE REPARACIÓN PARA UNA PIEZA
// =====================================================

// devuelve el costo de reparación de una pieza concreta
// sector = "trasero"/"delantero"/"lateral"
// repuesto = ej "BAUL"
// seg = código numérico del segmento (0..3)
function calcularReparacion({ sector, repuesto, seg }) {
    const lista = getListaPorSector(sector);

    // buscamos la fila que coincide con ese repuesto y ese segmento
    const fila = lista.find(
        (item) => item.repuesto === repuesto && item.seg == seg // == para "2" y 2
    );

    if (!fila) {
        return {
            ok: false,
            mensaje: "No hay ratio definido para ese repuesto en ese segmento.",
        };
    }

    const manoObra = CHAPA_BASE * fila.ratioMO;
    const pintura = PINTURA_BASE * fila.ratioP;
    const total = manoObra + pintura;

    return {
        ok: true,
        manoObra,
        pintura,
        total,
    };
}

// =====================================================
// 5) SIMULADOR INDIVIDUAL (sectorSelect + repuestoSelect + botón Calcular)
// =====================================================

// // Estos selects/botón/cuadro de resultado son el "panel de prueba"
// const sectorSelect = document.getElementById("sectorSelect");
// const repuestoSelect = document.getElementById("repuestoSelect");
// const btnCalcular = document.getElementById("btnCalcular");

// const boxResultadoCosto = document.getElementById("resultadoCosto");
// const outRepuesto = document.getElementById("outRepuesto");
// const outMO = document.getElementById("outMO");
// const outPintura = document.getElementById("outPintura");
// const outTotal = document.getElementById("outTotal");

// // llena el combo de repuestos únicos según el sector actual
// function poblarRepuestos() {
//     const sector = sectorSelect.value;
//     const lista = getListaPorSector(sector);

//     const repuestosUnicos = [...new Set(lista.map((x) => x.repuesto))];

//     repuestoSelect.innerHTML = "";
//     repuestosUnicos.forEach((r) => {
//         const opt = document.createElement("option");
//         opt.value = r;
//         opt.textContent = r;
//         repuestoSelect.appendChild(opt);
//     });
// }

// // cuando cambia el sector (trasero / delantero / lateral)
// sectorSelect.addEventListener("change", poblarRepuestos);

// // botón "Calcular" del panel de prueba
// btnCalcular.addEventListener("click", () => {
//     const sector = sectorSelect.value; // ej "trasero"
//     const repuesto = repuestoSelect.value; // ej "BAUL"

//     // necesitamos que haya vehículo elegido para conocer segmento (MM1/MM2/etc.)
//     if (!segmentoVehiculoSeleccionado) {
//         alert(
//             "Primero seleccioná Marca / Modelo / Versión para conocer el segmento (MM0/MM1/MM2/MM3)."
//         );
//         return;
//     }

//     // pasamos de "MM2" → 2
//     const segCodigo = segmentCodeFromLabel(segmentoVehiculoSeleccionado);

//     const r = calcularReparacion({
//         sector,
//         repuesto,
//         seg: segCodigo,
//     });

//     if (!r.ok) {
//         alert(r.mensaje);
//         return;
//     }

//     outRepuesto.textContent = repuesto;
//     outMO.textContent = fmtARS(r.manoObra);
//     outPintura.textContent = fmtARS(r.pintura);
//     outTotal.textContent = fmtARS(r.total);

//     boxResultadoCosto.style.display = "block";
// });

// =====================================================
// 6) GRILLA DE DAÑOS (checkboxes) + TOTALES ACUMULADOS
// =====================================================

// elementos visuales del total acumulado
const sumMO = document.getElementById("sumMO");
const sumPintura = document.getElementById("sumPintura");
const sumTotal = document.getElementById("sumTotal");

// recalc del total general (suma de todos los checkboxes marcados)
function recalcularTotales() {
    let totalMO = 0;
    let totalPintura = 0;
    let totalFinal = 0;

    Object.values(itemsSeleccionados).forEach((item) => {
        totalMO += item.manoObra;
        totalPintura += item.pintura;
        totalFinal += item.total;
    });

    sumMO.textContent = fmtARS(totalMO);
    sumPintura.textContent = fmtARS(totalPintura);
    sumTotal.textContent = fmtARS(totalFinal);
}

// handler cuando se tilda/destilda una pieza en la grilla
function onToggleDanio(e) {
    const checkbox = e.target;
    const isChecked = checkbox.checked;

    const sector = checkbox.dataset.sector; // "trasero", "delantero", "lateral"
    const repuesto = checkbox.dataset.repuesto; // "BAUL", "PARAGOLPE", etc.
    const tipo = checkbox.dataset.tipo; // "repara" o "cambia"

    if (!segmentoVehiculoSeleccionado) {
        alert(
            "Primero seleccioná Marca / Modelo / Versión para conocer el segmento del vehículo."
        );
        checkbox.checked = false;
        return;
    }

    const segCodigo = segmentCodeFromLabel(segmentoVehiculoSeleccionado);
    const key = `${sector}|${repuesto}|${tipo}`;

    if (isChecked) {
        // (por ahora tratamos 'cambia' igual que 'repara'; después podés diferenciarlo)
        const r = calcularReparacion({
            sector,
            repuesto,
            seg: segCodigo,
        });

        if (!r.ok) {
            alert(r.mensaje || "No se pudo calcular costo para esta pieza.");
            checkbox.checked = false;
            return;
        }

        itemsSeleccionados[key] = {
            manoObra: r.manoObra,
            pintura: r.pintura,
            total: r.total,
        };
    } else {
        delete itemsSeleccionados[key];
    }

    // actualizar caja de totales
    recalcularTotales();
}

// engancha los listeners de todos los checkboxes de la grilla
function attachListenersDanios() {
    document.querySelectorAll(".chk-dano").forEach((chk) => {
        chk.addEventListener("change", onToggleDanio);
    });
}
