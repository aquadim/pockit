<?php
namespace Pockit\Controllers;

// Контроллер автогоста

use Pockit\Models\ReportModel;
use Pockit\Models\SubjectModel;
use Pockit\Models\WorkTypeModel;
use Pockit\Models\TeacherModel;

use Pockit\Views\AutoGostArchiveView;
use Pockit\Views\AutoGostReportsView;
use Pockit\Views\AutoGostEditView;
use Pockit\Views\AutoGostNewReportView;

use Pockit\Views\AutoGostPages\AutoGostPage;

use Pockit\AutoGostSections\TitleSection;
use Pockit\AutoGostSections\SubSection;

class AutoGostController {

	// Загрузка изображений
	public static function uploadImage() {

		if (is_uploaded_file($_FILES['file']['tmp_name'])) {
			$mime_type = mime_content_type($_FILES['file']['tmp_name']);
			$filepath = tempnam(rootdir."/img/autogost", "rgnupload");

			if ($mime_type == "image/png") {
				// Конвертирование png в gif
				$png_image = imagecreatefrompng($_FILES['file']['tmp_name']);
				$gif_image = imagecreatetruecolor(imagesx($png_image), imagesy($png_image));
				imagecopy($gif_image, $png_image, 0, 0, 0, 0, imagesx($png_image), imagesy($png_image));
				imagegif($gif_image, $filepath);
			} else {
				// Просто перемещение файла
				$filepath = tempnam(rootdir."/img/autogost", "rgnupload");
				move_uploaded_file($_FILES['file']['tmp_name'], $filepath);
			}

			$output = ["ok"=>true, "filename"=>basename($filepath)];
		} else {
			$output = ["ok"=>false];
		}
		echo json_encode($output);
	}

	// Список отчётов по дисциплине
	public static function listReports($subject_id) {
		
		$reports = ReportModel::where("subject_id", $subject_id);
		$subject = SubjectModel::getById($subject_id);

		$view = new AutoGostReportsView([
			"page_title" => "Автогост: архив ".$subject['name'],
			"crumbs" => ["Главная" => "/", "Автогост: дисциплины" => "/autogost/archive", $subject['name'] => ""],
			"reports" => $reports,
			"subject" => $subject
		]);
		$view->view();
	}

	// Архив отчётов
	public static function archive() {
		$subjects = SubjectModel::all();

		$view = new AutoGostArchiveView([
			"page_title" => "Автогост: архив",
			"crumbs" => ["Главная" => "/", "Автогост: дисциплины" => "/"],
			"subjects" => $subjects
		]);
		$view->view();
	}

	// Редактирование отчёта
	public static function edit($report_id) {
		$report = ReportModel::getById($report_id);
		$subject = SubjectModel::getById($report['subject_id']);
		$filename = "Автогост - ".$subject['name']." #".$report['work_number']." - Королёв";

		$view = new AutoGostEditView([
			"page_title" => $filename,
			"crumbs" => ["Главная"=>"/", "Автогост: дисциплины" => "/autogost/archive/", $subject['name'] => "/autogost/archive/".$subject['id'], "Редактирование"=>"/"],
			"markup" => $report['markup'],
			"filename" => $filename,
			"report_id" => $report_id
		]);
		$view->view();
	}

	// Валидация создания отчёта
	private static function validateCreation() {
		if (empty($_POST["number"])) {
			// Запрос на создание
			return 'Не указан номер работы';
		}
		return true;
	}

	// Создание отчёта
	public static function newReport() {
		$subjects = SubjectModel::all();
		$worktypes = WorkTypeModel::all();

		if (!empty($_POST)) {
			$response = self::validateCreation();
			if ($response === true) {
				// Валидация успешна

				// Создаём запись
				$work_type = WorkTypeModel::getById($_POST['work_type']);
				
				$report_id = ReportModel::create(
					$_POST["subject_id"],
					$_POST['work_type'],
					$_POST['number'],
					$_POST['notice'],
					"!-\n!\n#{$work_type['name_nom']} №{$_POST['number']}\n"
				);

				// Перенаправляем на предпросмотр этого отчёта
				header("Location: /autogost/edit/".$report_id);
				return;
			} else {
				// Валидация провалена
				$error_text = $response;
			}
		} else {
			$error_text = null;
		}
		
		$view = new AutoGostNewReportView([
			"page_title" => "Автогост: создание отчёта",
			'subjects' => $subjects,
			'worktypes' => $worktypes,
			'error_text' => $error_text,
			"crumbs" => ["Главная"=>"/", "Автогост: создание отчёта" => "/"]
		]);
		$view->view();
	}

	// Получение HTML
	public static function getHtml() {
		$report 	= ReportModel::getById($_POST['report_id']);
		$subject 	= SubjectModel::getById($report["subject_id"]);
		$work_type	= WorkTypeModel::getById($report["work_type"]);
		$teacher	= TeacherModel::getById($subject["teacher_id"]);

		$document = [];
		$current_page = 1;
		$current_img = 1; // Номер текущего рисунка
		$expr_is_raw_html = false; // Выражение - чистый HTML?

		$lines = explode("\n", $report['markup']);

		foreach ($lines as $expr) {
			if (mb_strlen($expr) == 0) {
				continue;
			}

			if ($expr[0] != "@") {
				// Выражение - обычный текст
				// FIXME: end($document) может быть false
				if ($expr_is_raw_html) {
					end($document)->addHTML($expr);
				} else {
					end($document)->addHTML("<p class='report-text'>".$expr."</p>");
				}
				continue;
			}

			$command = explode(":", $expr);
			$command_name = $command[0];
			switch ($command_name) {
				case "@titlepage":
					// Титульный лист
					$document[] = new TitleSection($current_page);
					$current_page++;
					break;

				case "@section":
					// Секция основной части
					$document[] = new SubSection($current_page, $command[1]);
					$current_page++;
					break;

				case "@\\":
					// Перенос строки
					end($document)->addHTML("<br/>");
					break;

				case "@img":
					// Изображение
					if (count($command) >= 4) {
						$imgwidth = "width='".$command[3]."'";
					} else {
						$imgwidth = "";
					}
					end($document)->addHTML(
						"<figure>
							<img ".$imgwidth." src='/img/autogost/".$command[1]."'>
							<figcaption>Рисунок ".$current_img." - ".$command[2]."</figcaption>
						</figure>"
					);
					$current_img++;
					break;

				case "@raw":
					// Чистый HTML
					$expr_is_raw_html = true;
					break;

				case "@endraw":
					// /Чистый HTML
					$expr_is_raw_html = false;
					break;

				case "@/":
				case "@-":
					// Разрыв страницы
					end($document)->pageBreak($current_page);
					$current_page++;
					break;
				
				default:
					throw new \Exception("Unknown command: ".$command_name);
					break;
			}
		}

		AutoGostPage::init(
			$subject,
			$teacher,
			$work_type,
			$current_page - 1,
			$report
		);

		echo "<!DOCTYPE html>";
		echo "<html>";
		echo "<head><link rel='stylesheet' href='/css/autogost-report.css'></head>";
		echo "<body><div id='preview'>";
		foreach ($document as $section) {
			$section->output();
		}
		echo "</div></body>";
		echo "</html>";
	}
}
