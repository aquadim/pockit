<?php
namespace Pockit\Controllers;

// Контроллер API

use Pockit\Models\ReportModel;
use Pockit\Models\SubjectModel;
use Pockit\Models\WorkTypeModel;
use Pockit\Models\TeacherModel;
use Pockit\Models\PasswordModel;
use Pockit\Models\LinkModel;

class ApiController {

	// Добавление предмета
	public static function createSubject() {
		$id = SubjectModel::create($_POST['name'], $_POST['code'], $_POST['teacher_id'], $_POST['my_name']);
		$subject = SubjectModel::getById($id);
		echo json_encode($subject);
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
	
	// Обновление ссылки
	public static function updateLink() {
		$link = LinkModel::getById($_POST['id']);
		$link['name'] = $_POST['name'];
		$link['href'] = $_POST['href'];
		LinkModel::update($link);
		echo json_encode($link);
	}

	// Удаление предмета
	public static function deleteSubject() {
		SubjectModel::deleteById($_GET['id']);
	}
	
	// Удаление ссылки
	public static function deleteLink() {
		LinkModel::deleteById($_GET['id']);
	}
	
	// Удаление пароля
	public static function deletePassword() {
		PasswordModel::deleteById($_GET['id']);
	}

	// Обновление отчёта
	public static function updateReport() {
		$report = ReportModel::getById($_POST['id']);

		$fields = ['work_number', 'work_type', 'notice', 'markup'];
		foreach ($fields as $field) {
			if (isset($_POST[$field])) {
				$report[$field] = $_POST[$field];
			}
		}
		ReportModel::update($report);
		echo json_encode($report);
	}

	// Удаление отчёта
	public static function deleteReport() {
		ReportModel::deleteById($_GET['id']);
	}

	// Получение всех преподавателей
	public static function getTeachers() {
		$teachers = TeacherModel::all();
		$output = [];
		while ($teacher = $teachers->fetchArray(SQLITE3_ASSOC)) {
			$teacher['repr'] = $teacher['surname'];
			$output[] = $teacher;
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
}
