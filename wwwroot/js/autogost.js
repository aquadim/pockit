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

// Возвращает вывод: файл - текст?
function isText(file) {
    return file.type.split('/')[0] === 'text'
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

// caretAt - текущая позицияя курсора
// name - название таблицы
// delimeter - разделитель
// content - содержание таблицы
function insertTable(caretAt, name, delimeter, content) {
    // Текст строки с курсором
    const lineText = editor.state.doc.lineAt(caretAt).text;

    let prefix;
    if (lineText.length == 0) {
        // Это пустая строка, можно не переносить курсор на новую строку
        prefix = '';
    } else {
        prefix = '\n';
    }

    // Если файл имеет в конце перенос строки, то в разметку добавлять ещё один
    // ни к чему
    let postfix;
    if (content.endsWith('\n')) {
        postfix = '';
    } else {
        postfix = '\n';
    }

    const toInsert =
        prefix+
        "@table:" + name + ":" + delimeter + '\n' +
        content + postfix +
        '@endtable';
    
    editor.dispatch({
        changes: {
            from: caretAt,
            insert: toInsert
        }
    });

    // Перенос курсора
    const newPos = caretAt + toInsert.length;
    editor.dispatch({
        selection: EditorSelection.single(newPos)
    });

    unsavedChanges = true;
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

    unsavedChanges = true;
}

// Отправляет запрос на получение HTML
async function getHTML(report_id) {
    const response = await fetch(
        "http://localhost:9000/autogost/getHtml/"+report_id, 
    );
    return response;
}

// Возвращает разметку для отчёта
async function getMarkup(report_id) {
    const response = await fetch(
        "http://localhost:9000/reports/getMarkup/" + report_id,
        {
            method: "post",
            body: JSON.stringify({id: report_id})
        }
    );
    return response;
}

// Обновляет #preview на странице, отсылая запрос на получение HTML
// НЕ СОХРАНЯЕТ РАЗМЕТКУ
async function updatePreview(onSuccess, onFail) {
    const response = await getHTML(PHP_report_id);

    if (response.ok) {
        const data = await response.text();
        previewOut.innerHTML = data;
        onSuccess();
        console.log("Updating preview finished successfully");
    } else {
        const data = await response.json();
        console.log("Error when generating preview");
        onFail(data);
        editorLoader.classList.add('hidden');
        agstErrorsContainer.classList.remove('hidden');
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
    btnAddImage.setAttribute("disabled", "disabled");
    btnAddTable.setAttribute("disabled", "disabled");

    // Скрыть ошибки (но может они опять появятся)
    agstErrorsContainer.classList.add('hidden');

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
		await updatePreview(
            // on success:
            function() {
                editorLoader.classList.add('hidden');
                previewOut.classList.remove('hidden');
            },
            // on fail:
            function(data) {
                agstErrorsContainer.innerHTML = 
                '<p>Ошибка на строке <strong>'+ data.line + ': ' +
                data.text + '</strong>';
                agstErrorsContainer.classList.remove('hidden');
            }
        );
	});
}

// Переключает редактор в режим "Разметка"
async function editorToMarkup() {
    btnToMarkup.blur();
	btnToPreview.classList.remove('border-accent');
	btnToMarkup.classList.add('border-accent');
	editorSection.classList.remove("hidden");
	previewSection.classList.add("hidden");
    btnAddImage.removeAttribute("disabled");
    btnAddTable.removeAttribute("disabled");
    previewOut.classList.add('hidden');
    editorLoader.classList.add('hidden');
    agstErrorsContainer.classList.add('hidden');
}

// Сохранение разметки
async function saveMarkup(successCallback) {
    const response = await fetch(
        "http://localhost:9000/reports/updateMarkup/"+PHP_report_id, {
        method: "post",
        body: JSON.stringify(
            {markup: editor.state.doc.toString()}
        )
    });

    unsavedChanges = false;
    console.log("Markup saved");
    if (successCallback) {
        successCallback();
    }
}

// Автодополнение
function autogostCompletions(context) {
    let before = context.matchBefore(/^@@*\w*/);
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
const loaderAddImage= document.getElementById("loaderAddImage");
const btnPrint 		= document.getElementById("printReport");
const btnFilename 	= document.getElementById("getFilename");
const btnSave 		= document.getElementById("saveMarkupButton");
const btnAddTable   = document.getElementById("btnAddTable");

// Редактор
const previewSection        = document.getElementById("agstPreview");
const editorSection	        = document.getElementById("agstEditor");
const previewOut 	        = document.getElementById("agstOutput");
const editorLoader          = document.getElementById('agstLoader');
const agstErrors            = document.getElementById('agstErrors');
const agstErrorsContainer   = document.getElementById('agstErrorsContainer');
let unsavedChanges          = false;

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
        notify('Сохранено', 'success');
    });
}

btnToMarkup.onclick = async function(e) {
    await editorToMarkup();
}

btnAddImage.onclick = async function(e) {
    // Создание поля ввода для выбора изображений
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = 'multiple';

    input.onchange = async function(e) {
        if (!e.target.files[0]) {
            // Файлы не были выбраны
            return;
        }

        notify('Загрузка началась');
    
        for (const f of e.target.files) {
            // Если файл не изображение, пропускаем
            if (!isImage(f)) continue;

            // Загружаем изображение
            const uploadData = await uploadImage(f);
            if (!uploadData.ok) {
                notify(
                    'Не удалось загрузить изображение. ' +
                    uploadData.message,
                    'danger'
                );
                continue;
            }

            // Вставляем текст
            pasteImageMarker(
                editor.state.selection.main.head,
                uploadData.filename,
                uploadData.clientName
            );
        }
        notify('Загрузка завершена', 'success');
    }
    input.click();
}

btnPrint.onclick = function() {
    // При печати сохраняем разметку, затем обновляем превью, а потом вызываем
    // window.print
    saveMarkup(function() {
        updatePreview(
            // on success:
            function() {
                window.print();
            },
            // on fail:
            function(data) {
                notify('Ошибка на строке '+ data.line + ': ' + data.text, 'danger');
            }
        );
    });
}

btnFilename.onclick = async function() {
    // Получение названия файла для сохранения
	await navigator.clipboard.writeText(PHP_filename);
    notify('Название скопировано', 'success');
    btnFilename.blur();
}

btnAddTable.onclick = async function() {
    // Создать окно добавления таблицы
    const win = document.createElement('div');
    win.classList.add('card', 'modal');

    // Заголовок
    const heading = document.createElement('h1');
    heading.textContent = 'Добавление таблицы';

    // CSV файл
    const csvFileContainer = document.createElement('div');
    csvFileContainer.classList.add('form-control-container');
    const csvFileLabel = document.createElement('label');
    csvFileLabel.for = 'inpSelectCSV';
    csvFileLabel.textContent = 'CSV файл';
    const csvFileInput = document.createElement('input');
    csvFileInput.id = 'inpSelectCSV';
    csvFileInput.classList.add('form-control', 'btn');
    csvFileInput.type = 'file';
    csvFileInput.accept = '.csv,.txt';

    // Разделитель
    const delimContainer = document.createElement('div');
    delimContainer.classList.add('form-control-container');
    const delimLabel = document.createElement('label');
    delimLabel.for = 'inpDelimeter';
    delimLabel.textContent = 'Разделитель колонок';
    const delimInput = document.createElement('input');
    delimInput.id = 'inpDelimeter';
    delimInput.classList.add('form-control');
    delimInput.type = 'text';
    delimInput.value = ';';
    delimInput.placeholder = 'Каким символом отделяются колонки';

    // Подпись
    const labelContainer = document.createElement('div');
    labelContainer.classList.add('form-control-container');
    const labelLabel = document.createElement('label');
    labelLabel.for = 'inpLabel';
    labelLabel.textContent = 'Подпись таблицы';
    const labelInput = document.createElement('input');
    labelInput.id = 'inpLabel';
    labelInput.classList.add('form-control');
    labelInput.type = 'text';
    labelInput.placeholder = 'Как назвать таблицу';

    // Ряд кнопок
    const buttonRow = document.createElement('div');
    buttonRow.classList.add('succesCancelRow');

    // Кнопка "Готово"
    const btnDone = document.createElement('button');
    btnDone.classList.add('btn', 'success');
    btnDone.textContent = 'Готово';
    btnDone.onclick = async function() {
        // 1. Читаем файл
        const selectedFile = csvFileInput.files[0];
        if (selectedFile !== undefined && isText(selectedFile)) {
            // Файл - текст и был выбран
            const text = await selectedFile.text();

            // 2. Добавляем текст
            insertTable(
                editor.state.selection.main.head,
                labelInput.value,
                delimInput.value,
                text);
        }

        // 3. Скрываем все окна
        const toDelete = document.querySelectorAll('.modal, .dark-overlay');
        for (const item of toDelete) {
            item.remove();
        }
    }

    // Кнопка "Отмена"
    const btnCancel = document.createElement('button');
    btnCancel.classList.add('btn');
    btnCancel.textContent = 'Отмена';
    btnCancel.onclick = async function() {
        const toDelete = document.querySelectorAll('.modal, .dark-overlay');
        for (const item of toDelete) {
            item.remove();
        }
    }

    // Тёмный фон
    const overlay = document.createElement('div');
    overlay.classList.add('dark-overlay');

    // Упаковка
    csvFileContainer.append(csvFileLabel);
    csvFileContainer.append(csvFileInput);

    delimContainer.append(delimLabel);
    delimContainer.append(delimInput);

    labelContainer.append(labelLabel);
    labelContainer.append(labelInput);

    buttonRow.append(btnDone);
    buttonRow.append(btnCancel);

    win.append(heading);
    win.append(csvFileContainer);
    win.append(delimContainer);
    win.append(labelContainer);
    win.append(buttonRow);
    
    document.body.append(win);
    document.body.append(overlay);
}

window.addEventListener('beforeunload', function(e) {
    if (unsavedChanges === false) {
        return;
    }
    e.preventDefault();
    e.returnValue = true;
});

// ===CODEMIRROR===
let editor;
editorToLoader();

// Все ключевые слова
const completions = [
    {label: "@titlepage", type: "keyword", info: "Титульная страница"},
    {label: "@practicetitle", type: "keyword", info: "Титульная страница для практики"},
    {label: "@section:название", type: "keyword", info: "Секция основной части"},
    {label: "@-", type: "keyword", info: "Разрыв страницы"},
    {label: "@img:источник:подпись", type: "keyword", info: "Изображение"},
    {label: "@@:комментарий", type: "keyword", info: "Комментарий"},
    {label: "@table:название:разделитель", type: "keyword", info: "Таблица"},
    {label: "@endtable", type: "keyword", info: "Конец таблицы"},
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
    keyup: () => unsavedChanges = true
}
    
let agstTheme = EditorView.theme({
    "&": {
        color: 'var(--agstFg)',
        backgroundColor: 'var(--agstBg)'
    },

    ".cm-content": {
        caretColor: 'var(--agstFg)'
    },

    ".cm-cursor, .cm-dropCursor": {borderLeftColor: 'var(--agstFg)'},
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground,\
    .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: 'var(--agstSelection)'
    },

    ".cm-activeLine": {
        backgroundColor: "var(--agstActiveLine)"
    },

    ".cm-gutters, .cm-activeLineGutter": {
        backgroundColor: 'var(--agstGutterBg)',
        color: 'var(--agstGutterFg)',
        border: "none"
    },
}, {dark: true});

// Тема синтаксиса
let agstHighlightStyle = HighlightStyle.define([
    {tag: tags.keyword, color: "var(--agstKeyword)"},
    {tag: tags.separator, color: "var(--agstFg)"},
    {tag: tags.attributeValue, color: "var(--agstAttribute)"},
    {tag: tags.labelName, color: "var(--agstArgument)"},
    {tag: tags.comment, color: "var(--agstComment)"}
]);

// Язык
const AgstLanguage = StreamLanguage.define({
    name: "Autogost",
    startState: () => {
            return {lineKeyword: false, arg: false, argNum: 0}
    },
    token: function(stream, state) {

        // Комментарий
        if (stream.match(/^@@\:.*/)) {
            return "comment";
        }

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
                run() {
                    saveMarkup(() =>
                    {
                        notify('Сохранено', 'success');
                        unsavedChanges = false;
                    });
                    return true;
                }
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