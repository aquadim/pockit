import {EditorView, basicSetup} from "codemirror"
import {EditorState, EditorSelection} from "@codemirror/state"
import {autocompletion} from "@codemirror/autocomplete"
import {keymap} from "@codemirror/view"
import {tags} from "@lezer/highlight";
import {
    LanguageSupport,
    StreamLanguage,
    StringStream,
    HighlightStyle,
    syntaxHighlighting
} from "@codemirror/language";

// Возвращает вывод: файл - изображение?
function isImage(file) {
    return file.type.split('/')[0] === 'image'
}

// Загружает изображение на сервер, возвращает ответ сервера
async function uploadImage(file) {
    const fd = new FormData();
    fd.append('file', file);

    const response = await fetch("http://localhost:9000/autogost/upload-image", {
        method: 'post',
        body: fd
    });
    const data = await response.json();
    return data;
}

// caretAt маркер изображения на данную позицию
// start - позиция курсора вставки
// filename - название файла
// label - подпись
function pasteImageMarker(caretAt, filename, label='Изображение') {
    // Текст строки с курсором
    const lineText = editor.state.doc.lineAt(caretAt).text;

    let prefix;
    if (lineText.length == 0) {
        // Это пустая строка, можно не переносить курсор на новую строку
        prefix = '';
    } else {
        prefix = '\n';
    }

    const line = prefix+"@img:"+filename+":"+label;
    
    editor.dispatch({
        changes: {
            from: caretAt,
            insert: line
        }
    });

    // Перенос курсора
    const newPos = caretAt + line.length;
    editor.dispatch({
        selection: EditorSelection.single(newPos)
    });
}

// Отправляет запрос на получение HTML
async function getHTML(report_id) {
    const response = await fetch("http://localhost:9000/autogost/gethtml", {
        method: "post",
        body: JSON.stringify({report_id: report_id})
    });
    return response;
}

// Возвращает разметку для отчёта
async function getMarkup(report_id) {
    const response = await fetch("http://localhost:9000/reports/get", {
        method: "post",
        body: JSON.stringify({id: report_id})
    });
    return response;
}

// Обновляет #preview на странице, отсылая запрос на получение HTML
// НЕ СОХРАНЯЕТ РАЗМЕТКУ
async function updatePreview(onSuccess) {
    const response = await getHTML(PHP_report_id);

    if (response.ok) {
        const data = await response.text();
        previewOut.innerHTML = data;
        onSuccess();
        console.log("Updating preview finished successfully");
    } else {
        console.error("Error when generating preview");
    }
}

// Переключает состояние боковой панели
function toggleSidebar() {
    sidebarOpened = !sidebarOpened;
    if (sidebarOpened) {
        openSidebar();
    } else {
        closeSidebar();
    }
}

// Открывает панель инструментов
function openSidebar() {
    sidebar.classList.add("sidebarOpen");
    content.classList.add("contentShifted");
    btnSidebarToggle.textContent = "❌ Закрыть панель инструментов";
}

// Закрывает панель инструментов
function closeSidebar() {
    sidebar.classList.remove("sidebarOpen");
    content.classList.remove("contentShifted");
    btnSidebarToggle.textContent = "📖 Открыть панель инструментов";
}

// Переключает редактор в режим "Загрузка"
function editorToLoader() {
    editorLoader.classList.remove('hidden');
}

// Переключает редактор в режим "Превью"
async function editorToPreview() {
    // Отжать кнопку
    btnToPreview.blur();

    // Анимация загрузки
    previewOut.classList.add('hidden');
    editorToLoader();

    // Некоторые кнопки недоступны
    lblAddImage.setAttribute("disabled", "disabled");
    btnAddImage.setAttribute("disabled", "disabled");

    // Переключение видимости секций
	editorSection.classList.add("hidden");
	previewSection.classList.remove("hidden");
	btnToMarkup.classList.remove('border-accent');
	btnToPreview.classList.add('border-accent');

	// 1. Разметка сохраняется
	// 2. Превью обновляется
    // 3.1 Скрываем загрузку
    // 3.2 Открываем превью
	await saveMarkup(async function() {
		await updatePreview(function() {
            editorLoader.classList.add('hidden');
            previewOut.classList.remove('hidden');
		});
	});
}

// Переключает редактор в режим "Разметка"
async function editorToMarkup() {
    btnToMarkup.blur();
	btnToPreview.classList.remove('border-accent');
	btnToMarkup.classList.add('border-accent');
	editorSection.classList.remove("hidden");
	previewSection.classList.add("hidden");
	lblAddImage.removeAttribute("disabled");
    btnAddImage.removeAttribute("disabled");
    previewOut.classList.add('hidden');
    editorLoader.classList.add('hidden');
}

// Сохранение разметки
async function saveMarkup(successCallback) {
    const response = await fetch("http://localhost:9000/reports/update", {
        method: "post",
        body: JSON.stringify(
            {id: PHP_report_id, markup: editor.state.doc.toString()}
        )
    });

    if (response.ok) {
        unsavedChanges = true;
        btnSave.blur();
        console.log("Markup saved");
        if (successCallback) {
            successCallback();
        }
        return;
    }

    console.error("Failed to save markup");
}

// Автодополнение
function autogostCompletions(context) {
    let before = context.matchBefore(/^@\w*/);
    if (!context.explicit && !before) {
        return null;
    }
    return {
        from: before ? before.from : context.pos,
        options: completions,
        validFor: /^\w*$/
    }
}

// Боковая панель
let sidebarOpened       = true;
const sidebar           = document.getElementById('agstSidebar');
const content           = document.getElementById('agstMain');
const btnSidebarToggle  = document.getElementById('btnToggleSidebar');

// Кнопки боковой панели
const btnToPreview 	= document.getElementById("switchPreview");
const btnToMarkup 	= document.getElementById("switchMarkup");
const btnAddImage 	= document.getElementById("btnAddImage");
const lblAddImage 	= document.getElementById("lblAddImage");
const loaderAddImage= document.getElementById("loaderAddImage");
const btnPrint 		= document.getElementById("printReport");
const btnFilename 	= document.getElementById("getFilename");
const btnSave 		= document.getElementById("saveMarkupButton");
const btnGetHTML    = document.getElementById("btnGetHTML");

// Редактор
const previewSection= document.getElementById("agstPreview");
const editorSection	= document.getElementById("agstEditor");
const previewOut 	= document.getElementById("agstOutput");
const editorLoader  = document.getElementById('agstLoader');
let unsavedChanges  = false;

// -- Привязка событий --
btnSidebarToggle.onclick = async function(e) {
    toggleSidebar();
    btnSidebarToggle.blur();
}

btnToPreview.onclick = async function(e) {
    await editorToPreview();
}

btnSave.onclick = async function(e) {
    saveMarkup(function() {
        btnSave.blur();
    });
}

btnToMarkup.onclick = async function(e) {
    await editorToMarkup();
}

btnAddImage.onchange = async function(e) {
    if (!e.target.files[0]) return; // Файлы не были выбраны

    let uploadData;
    
    loaderAddImage.classList.remove('hidden');
    for (const f of e.target.files) {
        // Если файл не изображение, пропускаем
        if (!isImage(f)) continue;

        // Загружаем изображение
        uploadData = await uploadImage(f);
        if (!uploadData.ok) {
            console.error('Failed to upload image!');
            continue;
        }

        // Вставляем текст
        pasteImageMarker(
            editor.state.selection.main.head,
            uploadData.filename,
            uploadData.clientName
        );
    }
    loaderAddImage.classList.add('hidden');
}

btnPrint.onclick = function() {
    // При печати сохраняем разметку, затем обновляем превью, а потом вызываем
    // window.print
    saveMarkup(function() {
        updatePreview(function() {
            window.print();
        });
    });
}

btnFilename.onclick = async function() {
    // Получение названия файла для сохранения
	await navigator.clipboard.writeText(PHP_filename);
}

// ===CODEMIRROR===
let editor;
editorToLoader();

// Все ключевые слова
const completions = [
    {label: "@titlepage", type: "keyword", info: "Титульная страница"},
    {label: "@section:Название", type: "keyword", info: "Секция основной части"},
    {label: "@-", type: "keyword", info: "Разрыв страницы"},
    {label: "@img:Источник:Подпись", type: "keyword", info: "Изображение"},
    {label: "@\\", type: "keyword", info: "Пустая строка"},
    {label: "@raw", type: "keyword", info: "Начало чистого HTML"},
    {label: "@endraw", type: "keyword", info: "Конец чистого HTML"},
    {label: "@@:Комментарий", type: "keyword", info: "Комментарий"},
];

// События DOM редактора разметки
let editorEventHandlers = {
    // Вставка картинки (функция должна быть синхронной почему-то, иначе
    // обычный текст не вставляется ну никак)
    // https://stackoverflow.com/a/6338207
    paste: function(e, ed) {
        let items = (e.clipboardData || e.originalEvent.clipboardData).items;
        
        for (const item of items) {
            // Этот элемент вставки - не файл
            if (item.kind !== 'file') continue;
            const file = item.getAsFile();
            if (!isImage(file)) continue;

            // Загружаем изображение
            uploadImage(file).then(function(uploadData) {
                if (!uploadData.ok) {
                    console.error('Failed to upload image!');
                    return;
                }

                // Вставляем текст
                pasteImageMarker(
                    editor.state.selection.main.head,
                    uploadData.filename,
                    uploadData.clientName
                );
            });
        }
    },

    // Обработчик события дропа на редактор
    // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop
    drop: function(e) {
        if (!e.dataTransfer.items) return true;

        let uploadData;
        
        for (const item of e.dataTransfer.items) {
            // Если файл - не файл и не изображение - пропускаем
            if (!item.kind === "file") continue;
            const file = item.getAsFile();
            if (!isImage(file)) continue;

            // Загружаем изображение
            uploadImage(file).then(function(uploadData) {
                if (!uploadData.ok) {
                    console.error('Failed to upload image!');
                    return;
                }

                // Вставляем текст
                pasteImageMarker(
                    editor.state.selection.main.head,
                    uploadData.filename,
                    uploadData.clientName
                );
            });
        }
    }
}

// Тема редактора
const
    ivory = "#b6c3cf",
    background = "#3B3B3B",
    cursor = "#E6E6FA",
    selection = "#2f5692",
    darkBackground = "#303030",
    stone = "#7d8799";
    
let agstTheme = EditorView.theme({
    "&": {
    color: ivory,
    backgroundColor: background
    },

    ".cm-content": {
        caretColor: cursor
    },

    ".cm-cursor, .cm-dropCursor": {borderLeftColor: cursor},
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {backgroundColor: selection},

    ".cm-searchMatch": {
        backgroundColor: "#C9BD3E",
        outline: "2px solid #FF804C"
    },

    ".cm-activeLine": {backgroundColor: "#4343437f"},
    ".cm-selectionMatch": {backgroundColor: "#aafe661a"},

    ".cm-gutters, .cm-activeLineGutter": {
        backgroundColor: darkBackground,
        color: stone,
        border: "none"
    },
}, {dark: true});

// Тема синтаксиса
let agstHighlightStyle = HighlightStyle.define([
    {tag: tags.keyword, color: "#d58a4a"},
    {tag: tags.separator, color: "#b6c3cf"},
    {tag: tags.attributeValue, color: "#edc881"},
    {tag: tags.labelName, color: "#a88ab6"}
]);

// Язык
const AgstLanguage = StreamLanguage.define({
    name: "Autogost",
    startState: () => {
            return {lineKeyword: false, arg: false, argNum: 0}
    },
    token: function(stream, state) {

        // Ключевые слова:
        // @titlepage, @section, @- ...
        if (stream.match(/^@(\w|-|\\)*$/)) {
            return "keyword";
        }

        // Ключевые слова после которых идут аргументы
        if (stream.match(/^@(\w|-|\\)*/)) {
            state.lineKeyword = true;
            return "keyword";
        }

        // Двоеточие в конце
        if (state.lineKeyword && stream.match(/^:$/)) {
            state.lineKeyword = false;
            state.argNum = 0;
            return "separator";
        }

        // Двоеточие
        if (state.lineKeyword && stream.match(/^:/)) {
            state.argNum++;
            return "separator";
        }

        // Последний аргумент
        if (state.lineKeyword && stream.match(/^[^:]*$/, true, true)) {
            let output;

            if (state.argNum == 1) {
                output = "attributeValue";
            } else {
                output = "labelName";
            }

            state.lineKeyword = false;
            state.argNum = 0;
            
            return output;
        }

        // Не последний аргумент
        if (state.lineKeyword && stream.match(/^[^:]*/, true, true)) {
            if (state.argNum == 1) {
                return "attributeValue";
            }
            return "labelName";
        }

        stream.skipToEnd();
        return null;
    }
});

getMarkup(PHP_report_id).
then(async function(response) {
    let responseData = await response.json();
    let initialMarkup = responseData['markup'];

    let cmEditorState = EditorState.create({
        doc: initialMarkup,
        extensions: [
            basicSetup,
            EditorView.lineWrapping,
            autocompletion({override: [autogostCompletions]}),
            keymap.of([{
                key: "Ctrl-s",
                run() { saveMarkup(null); return true }
            }]),
            EditorView.domEventHandlers(editorEventHandlers),
            agstTheme,
            syntaxHighlighting(agstHighlightStyle),
            new LanguageSupport(AgstLanguage)
        ],
    });

    // CodeMirror init
    editor = new EditorView({
        state: cmEditorState,
        lineWrapping: true,
        parent: editorSection
    });

    // Скрыть загрузчик
    editorLoader.classList.add('hidden');
    
});