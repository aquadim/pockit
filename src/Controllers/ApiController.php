<?php
namespace Pockit\Controllers;

// Контроллер API

use Pockit\Common\Database;
use Pockit\Models\Subject;
use Pockit\Models\Teacher;

class ApiController {

	#region CREATE
	// Добавление предмета
	public static function createSubject() {
        if (!isset($_POST['name']) || $_POST['name'] === '') {
            self::echoError('Не введено название дисциплины');
            exit();
        }
        if (!isset($_POST['code']) || $_POST['code'] === '') {
            self::echoError('Не введён шифр дисциплины');
            exit();
        }
        if (!isset($_POST['myName']) || $_POST['myName'] === '') {
            $my_name = $_POST['name'];
        } else {
            $my_name = $_POST['myName'];
        }

        // Поиск препода по ID
        $em = Database::getEm();
        $teacher = $em->find(Teacher::class, $_POST['teacherId']);

        // Создание дисциплины
        $subject = new Subject();
        $subject->setName($_POST['name']);
        $subject->setMyName($my_name);
        $subject->setCode($_POST['code']);
        $subject->setTeacher($teacher);
        $subject->setHidden(false);

        $em->persist($subject);
        $em->flush();

        echo json_encode(['ok'=>true, 'obj'=>$subject->toArray()]);
	}
	
	// Добавление ссылки
	public static function createLink() {
		$id = LinkModel::create($_POST['name'], $_POST['href']);
		$link = LinkModel::getById($id);
		echo json_encode($link);
	}
	
	// Добавление пароля
	public static function createPassword() {
		$id = PasswordModel::create($_POST['name'], $_POST['password'], $_POST['key']);
		$password = PasswordModel::getById($id);
		echo json_encode($password);
	}
	#endregion

	#region READ
	// Получение отчёта
	public static function getReport() {
		$data = json_decode(file_get_contents("php://input"), true);
		$report = ReportModel::getById($data['id']);
		echo json_encode($report);
	}

	// Получение всех преподавателей
	public static function getTeachers() {
		$em = Database::getEm();
        $query = $em->createQuery(
            'SELECT teacher FROM '.Teacher::class.' teacher '
        );
        $teachers = $query->getResult();

        $output = [];
        foreach ($teachers as $t) {
            $output[] = $t->toArray();
        }
        echo json_encode($output);
	}

	// Получение всех типов работ
	public static function getWorkTypes() {
		$worktypes = WorkTypeModel::all();
		$output = [];
		while ($worktype = $worktypes->fetchArray(SQLITE3_ASSOC)) {
			$worktype['repr'] = $worktype['name_nom'];
			$output[] = $worktype;
		}
		echo json_encode($output);
	}

    // Получение всех дисциплин
    public static function readSubject() {
        $em = Database::getEm();
        $query = $em->createQuery(
            'SELECT subject FROM '.Subject::class.' subject '.
            'WHERE subject.hidden=false'
        );
        $subjects = $query->getResult();

        $output = [];
        foreach ($subjects as $s) {
            $output[] = $s->toArray();
        }
        echo json_encode($output);
    }
	#endregion

	#region UPDATE
	// Обновление разметки отчёта
	public static function updateReportMarkup() {
		$input = json_decode(file_get_contents("php://input"), true);
		$report = ReportModel::getById($input['id']);
		$report['markup'] = $input['markup'];
		ReportModel::update($report);
	}
	
	// Обновление отчёта
	public static function updateReport() {
		$report = ReportModel::getById($_POST['id']);

		$fields = [
			'work_number',
			'work_type',
			'notice',
			'markup',
			'date_for'
		];
		foreach ($fields as $field) {
			if (isset($_POST[$field])) {
				$report[$field] = $_POST[$field];
			}
		}
		ReportModel::update($report);
		echo json_encode($report);
	}

	// Обновление ссылки
	public static function updateLink() {
		$link = LinkModel::getById($_POST['id']);
		$link['name'] = $_POST['name'];
		$link['href'] = $_POST['href'];
		LinkModel::update($link);
		echo json_encode($link);
	}

	// Обновление предмета
	public static function updateSubject() {
		$subject = SubjectModel::getById($_POST['id']);
		$subject['name'] = $_POST['name'];
		$subject['code'] = $_POST['code'];
		$subject['teacher_id'] = $_POST['teacher_id'];
		$subject['my_name'] = $_POST['my_name'];
		SubjectModel::update($subject);
		echo json_encode($subject);
	}
	#endregion

	#region DELETE
	// Удаление предмета
	public static function deleteSubject() {
		$em = Database::getEm();
        $subject = $em->find(Subject::class, $_GET['id']);
        $subject->setHidden(true);
        $em->flush();
	}
	
	// Удаление ссылки
	public static function deleteLink() {
		LinkModel::hideById($_GET['id']);
	}
	
	// Удаление пароля
	public static function deletePassword() {
		PasswordModel::hideById($_GET['id']);
	}

	// Удаление отчёта
	public static function deleteReport() {
		ReportModel::hideById($_GET['id']);
	}

    // Удаление темы
    public static function deleteTheme() {
        ThemeModel::deleteById($_GET['id']);
    }
	#endregion

	#region THEMES
	public static function addThemeFromZip() {
		if (!isset($_FILES['themeFile'])) {
			self::echoError('Не выбран файл темы');
			exit();
		}
		
		if (!is_uploaded_file($_FILES['themeFile']['tmp_name'])) {
			switch ($_FILES['themeFile']['error']) {
				case 0:
					$msg = "Обнаружена проблема с вашим файлом.";
					break;
				case 1:
				case 2:
					$msg = "Слишком большой файл";
					break;
				case 3:
					$msg = "Файл загружен только частично";
					break;
				case 4:
					$msg = "Вы должны загрузить файл";
					break;
				default:
					$msg = "Обнаружена проблема с вашим файлом";
					break;
			}
			self::echoError($msg);
			exit();
		}

		$zip = new \ZipArchive;
		$result = $zip->open($_FILES['themeFile']['tmp_name']);
		if ($result !== true) {
			self::echoError('Не удалось открыть архив');
			$zip->close();
			exit();
		}

		// Получение файла с цветами
		$theme_config = $zip->getFromName('theme.json');
		if ($theme_config === false) {
			self::echoError('Не найден theme.json');
			$zip->close();
			exit();
		}

		// TODO: Чтение изображений домашней страницы
		// TODO: Чтение изображений действий
		// TODO: Чтение шрифтов
        $zip->close();

        // -- Генерация CSS кода --
        $theme_spec = json_decode($theme_config, true);
        $css = ':root{';
        // color-scheme
        $css .= 'color-scheme: '.$theme_spec['color-scheme'].';';
        // --var
        foreach ($theme_spec['colors'] as $variable => $color_code) {
            $css .= '--'.$variable.':'.$color_code.';';
        }
        $css .= '}';

        // Добавление в базу данных
        $theme_id = ThemeModel::create(
            $theme_spec['name'],
            $theme_spec['author'],
            $css);
        $created_theme = ThemeModel::getById($theme_id);
        echo json_encode(['ok' => true, 'object' => $created_theme]);
	}

    // Активирует определённую тему
    public static function activateTheme($theme_id) {
        // Получаем CSS данные темы
        $theme = ThemeModel::getById($theme_id);

        // Перезаписываем CSS файл
        if ($theme !== false) {
            file_put_contents(
                index_dir . '/wwwroot/css/theme.css',
                $theme['css']);
        }

        header("Location: /settings/themes");
    }
	#endregion

	#region UTILS
	private static function echoError(string $error_message) {
		echo json_encode(['ok'=>false, 'message'=>$error_message]);
	}
	#endregion
}
