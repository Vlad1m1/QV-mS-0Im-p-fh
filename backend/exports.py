import csv
from dataclasses import dataclass
import io
import json

from backend.models import ExperimentDetail

CSV_COLUMNS = [
    'Эксперимент', 'Цель', 'Дата эксперимента', 'Автор эксперимента', 'Попытка',
    'Автор попытки', 'Время попытки UTC', 'Версия', 'Автор версии', 'Время версии UTC',
    'Тип', 'Показатель', 'Значение', 'Единица', 'Примечание', 'Причина исправления',
    'Номер эксперимента', 'Вид работы',
]


@dataclass(frozen=True)
class ExportDocument:
    body: str
    media_type: str
    filename: str


def csv_cell(value: object) -> str:
    text = str(value)
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@')) else text


def export_experiment(data: ExperimentDetail, format: str, exported_at: str) -> ExportDocument:
    filename = f'experiment-{data["number"]}.{format}'
    if format == 'json':
        body = json.dumps({'exported_at': exported_at, 'experiment': data},
                          ensure_ascii=False, indent=2)
        return ExportDocument(body, 'application/json', filename)
    if format != 'csv':
        raise ValueError(f'Unsupported export format: {format}')
    output = io.StringIO(newline='')
    writer = csv.writer(output, delimiter=';')
    writer.writerow(CSV_COLUMNS)
    for attempt in data['attempts']:
        for version in attempt['versions']:
            prefix = [data['title'], data['objective'], data['date'], data['author'],
                      attempt['number'], attempt['author'], attempt['created_at'],
                      version['version'], version['author'], version['created_at']]
            measurements = [
                ['Параметр', parameter['name'], parameter['value'], parameter['unit']]
                for parameter in version['parameters']
            ]
            measurements.append(['Результат', version['result_name'], version['result_value'], version['result_unit']])
            for measurement in measurements:
                writer.writerow([csv_cell(value) for value in prefix + measurement + [version['note'], version['reason'],
                                 data['number'], 'Совместная' if data['work_mode'] == 'shared' else 'Одиночная']])
    return ExportDocument('\ufeff' + output.getvalue(), 'text/csv; charset=utf-8', filename)
