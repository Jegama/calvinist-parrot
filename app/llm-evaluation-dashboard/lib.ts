import fs from "fs";
import path from "path";

export interface EvaluationRecord {
  id: string;
  criterion: string;
  subCriterion: string;
  value: number;
  System_Prompt_Label: string;
  Judge_Model: string;
  Gen_Model: string;
  Provider: string;
  [key: string]: string | number;
}

export async function getEvaluationData(): Promise<EvaluationRecord[]> {
  const filePath = path.join(process.cwd(), "content/data/api_evals_comparison.csv");
  const fileContent = await fs.promises.readFile(filePath, "utf-8");
  return parseData(fileContent);
}

function parseData(csv: string): EvaluationRecord[] {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const result: EvaluationRecord[] = [];
  const meta: Record<string, Record<string, string>> = {};

  // Identify Metadata lines
  const metaLines = lines.filter((line) => line.startsWith("Meta,"));
  const dataLines = lines.filter(
    (line) => !line.startsWith("Meta,") && !line.startsWith("Criterion,") && line.trim() !== ""
  );

  // Parse Metadata
  metaLines.forEach((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const key = cols[1]; // System_Prompt_Label, Judge_Model, etc.
    headers.slice(2).forEach((header, index) => {
      if (!meta[header]) meta[header] = {};
      // The value is at index + 2 because the first two cols are Meta, Key
      if (cols[index + 2]) {
        meta[header][key] = cols[index + 2];
      }
    });
  });

  // Parse Data
  dataLines.forEach((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const criterion = cols[0];
    const subCriterion = cols[1];

    headers.slice(2).forEach((header, index) => {
      const valStr = cols[index + 2];
      const val = parseFloat(valStr);

      if (!isNaN(val)) {
        result.push({
          id: header,
          criterion,
          subCriterion,
          value: val,
          System_Prompt_Label: meta[header]?.["System_Prompt_Label"] || "",
          Judge_Model: meta[header]?.["Judge_Model"] || "",
          Gen_Model: meta[header]?.["Gen_Model"] || "",
          Provider: meta[header]?.["Provider"] || "",
        });
      }
    });
  });

  return result;
}
