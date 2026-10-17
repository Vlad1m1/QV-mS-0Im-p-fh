import { journalApi } from "../api/client";
import type { ExportFormat } from "../domain/models";

export async function downloadExperiment(
  id: number,
  number: number,
  format: ExportFormat,
): Promise<void> {
  const url = URL.createObjectURL(await journalApi.export(id, format));
  const link = document.createElement("a");
  link.href = url;
  link.download = `experiment-${number}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
