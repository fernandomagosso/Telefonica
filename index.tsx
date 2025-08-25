/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "https://esm.run/@google/genai";
import React from "https://esm.run/react";
import ReactDOM from "https://esm.run/react-dom";

declare const pdfjsLib: any;
declare const html2pdf: any;

const App = () => {
  const [lang, setLang] = React.useState('pt');
  const [baseFile, setBaseFile] = React.useState(null);
  const [analysisFiles, setAnalysisFiles] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState('');
  const [generatedDoc, setGeneratedDoc] = React.useState('');
  const [error, setError] = React.useState('');
  const [today, setToday] = React.useState(new Date().toISOString().split('T')[0]);

  const i18n = {
    pt: {
      title: 'Analisador e Gerador de Documentos Regulatórios',
      lang_pt: 'Português (BR)',
      lang_en: 'English (US)',
      base_file_title: '1. Arquivo de Referência',
      base_file_desc: 'Carregue o documento PDF que servirá como base para a estrutura e cláusulas principais.',
      upload_base: 'Carregar Arquivo Base',
      analysis_files_title: '2. Arquivos para Análise',
      analysis_files_desc: 'Carregue um ou mais documentos PDF para comparar com o arquivo de referência.',
      upload_analysis: 'Carregar Arquivos de Análise',
      analyze_btn: 'Analisar e Gerar Documento',
      analyzing: 'Analisando...',
      loading_extract: 'Extraindo texto dos PDFs...',
      loading_analyze: 'Analisando cláusulas com a IA...',
      loading_generate: 'Gerando documento unificado...',
      result_title: 'Documento Unificado Gerado',
      save_pdf: 'Salvar em PDF',
      date_label: 'Data de Vigência:',
      location_label: 'Local:',
      signature: 'TELEFÔNICA BRASIL S.A.',
      error_generic: 'Ocorreu um erro. Por favor, tente novamente.',
      error_pdf_extraction: 'Falha ao extrair texto de um dos PDFs.',
      error_gemini: 'Erro ao chamar a API do Gemini:',
    },
    en: {
      title: 'Regulatory Document Analyzer and Generator',
      lang_pt: 'Português (BR)',
      lang_en: 'English (US)',
      base_file_title: '1. Reference File',
      base_file_desc: 'Upload the PDF document that will serve as the basis for the structure and main clauses.',
      upload_base: 'Upload Base File',
      analysis_files_title: '2. Files for Analysis',
      analysis_files_desc: 'Upload one or more PDF documents to compare against the reference file.',
      upload_analysis: 'Upload Analysis Files',
      analyze_btn: 'Analyze and Generate Document',
      analyzing: 'Analyzing...',
      loading_extract: 'Extracting text from PDFs...',
      loading_analyze: 'Analyzing clauses with AI...',
      loading_generate: 'Generating unified document...',
      result_title: 'Generated Unified Document',
      save_pdf: 'Save as PDF',
      date_label: 'Effective Date:',
      location_label: 'Location:',
      signature: 'TELEFÔNICA BRASIL S.A.',
      error_generic: 'An error occurred. Please try again.',
      error_pdf_extraction: 'Failed to extract text from one of the PDFs.',
      error_gemini: 'Error calling the Gemini API:',
    }
  };

  const t = i18n[lang];

  const handleBaseFileChange = (e) => {
    if (e.target.files.length > 0) {
      setBaseFile(e.target.files[0]);
    }
  };

  const handleAnalysisFilesChange = (e) => {
    if (e.target.files.length > 0) {
      setAnalysisFiles([...e.target.files]);
    }
  };

  const extractTextFromPdf = async (file) => {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async (event) => {
        try {
          if (!event.target?.result || !(event.target.result instanceof ArrayBuffer)) {
            reject(new Error('File could not be read as ArrayBuffer.'));
            return;
          }
          const typedarray = new Uint8Array(event.target.result);
          const pdf = await pdfjsLib.getDocument(typedarray).promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ');
          }
          resolve(text);
        } catch (error) {
          console.error(`Error processing PDF ${file.name}:`, error);
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleAnalyze = async () => {
    setIsLoading(true);
    setError('');
    setGeneratedDoc('');

    try {
      setLoadingMessage(t.loading_extract);
      const baseText = await extractTextFromPdf(baseFile);
      const analysisTexts = await Promise.all(analysisFiles.map(extractTextFromPdf));
      
      setLoadingMessage(t.loading_analyze);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const analysisFilesContent = analysisTexts.map((text, index) => 
        `Documento para Análise ${index + 1}:\n---\n${text}\n---\n`
      ).join('\n');

      const pt_prompt = `
        Você é um especialista em documentos regulatórios de telecomunicações no Brasil. Sua tarefa é analisar e unificar vários regulamentos de planos de voz em um único documento mestre. A linguagem deve ser formal, precisa e seguir os padrões regulatórios.

        **Documento de Referência (Base):**
        ---
        ${baseText}
        ---

        **Documentos para Análise:**
        ${analysisFilesContent}

        **Instruções Detalhadas:**
        1.  **Estrutura e Formato:** Use a estrutura de cláusulas do Documento de Referência como guia (ex: OBJETIVO, CONDIÇÕES DA OFERTA, etc.). O output deve ser um documento completo e pronto para uso, não uma lista de diferenças.
        2.  **Unificação de Cláusulas Comuns:** Para tópicos presentes em todos os documentos, crie uma única cláusula unificada. Esta cláusula deve ser a versão mais clara, completa e juridicamente robusta, combinando as informações de todos os inputs. Corrija rigorosamente a ortografia e a concordância verbal.
        3.  **Incorporação de Cláusulas Não Comuns:** Se um documento de análise contiver uma cláusula importante que não está no documento base, incorpore-a na seção apropriada do novo documento unificado.
        4.  **Consistência:** Mantenha um tom e terminologia consistentes em todo o documento.
        5.  **Output Final:** O documento final deve incluir um campo para 'Local' e 'Data', e terminar com 'TELEFÔNICA BRASIL S.A.' em uma linha separada e centralizada. Não inclua comentários ou notas de rodapé, apenas o texto final do regulamento.

        Comece a gerar o documento unificado agora.
      `;

      const en_prompt = `
        You are an expert in Brazilian telecommunications regulatory documents. Your task is to analyze and merge several voice plan regulations into a single master document. The language must be formal, precise, and adhere to regulatory standards.

        **Reference Document (Base):**
        ---
        ${baseText}
        ---

        **Documents for Analysis:**
        ${analysisFilesContent}
        
        **Detailed Instructions:**
        1.  **Structure and Format:** Use the clause structure from the Reference Document as a guide (e.g., OBJECTIVE, OFFER CONDITIONS, etc.). The output must be a complete, ready-to-use document, not a list of differences.
        2.  **Unification of Common Clauses:** For topics present across all documents, create a single, unified clause. This clause should be the clearest, most complete, and legally robust version, combining information from all inputs. Rigorously correct spelling and grammar.
        3.  **Incorporation of Uncommon Clauses:** If an analysis document contains an important clause not present in the base document, incorporate it into the appropriate section of the new unified document.
        4.  **Consistency:** Maintain a consistent tone and terminology throughout the entire document.
        5.  **Final Output:** The final document must include a field for 'Location' and 'Date', and end with 'TELEFÔNICA BRASIL S.A.' on a separate, centered line. Do not include comments or footnotes, only the final regulation text.
        
        Begin generating the unified document now.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: lang === 'pt' ? pt_prompt : en_prompt,
        config: {
            temperature: 0.8,
        }
      });
      
      setLoadingMessage(t.loading_generate);
      setGeneratedDoc(response.text);

    } catch (err) {
      console.error(err);
      if (err instanceof TypeError) {
          setError(t.error_pdf_extraction);
      } else {
          setError(`${t.error_gemini} ${err.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSavePdf = () => {
    const element = document.getElementById('generated-doc-container');
    const opt = {
      margin:       1,
      filename:     'documento_regulatorio_unificado.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
  };

  const renderFileList = (files) => (
    <ul className="file-list">
      {(Array.isArray(files) ? files : [files]).map((file, index) => (
        <li key={index}>{file.name}</li>
      ))}
    </ul>
  );

  return (
    <>
      <header>
        <div className="header-content">
          <h1>{t.title}</h1>
          <div className="lang-switcher">
            <button onClick={() => setLang('pt')} className={lang === 'pt' ? 'active' : ''}>{t.lang_pt}</button>
            <button onClick={() => setLang('en')} className={lang === 'en' ? 'active' : ''}>{t.lang_en}</button>
          </div>
        </div>
      </header>
      <main className="container">
        <div className="upload-section">
          <div className="upload-card">
            <h2>{t.base_file_title}</h2>
            <p>{t.base_file_desc}</p>
            <label htmlFor="base-file-input" className="file-input-label">{t.upload_base}</label>
            <input id="base-file-input" type="file" accept=".pdf" onChange={handleBaseFileChange} />
            {baseFile && renderFileList(baseFile)}
          </div>
          <div className="upload-card">
            <h2>{t.analysis_files_title}</h2>
            <p>{t.analysis_files_desc}</p>
            <label htmlFor="analysis-files-input" className="file-input-label">{t.upload_analysis}</label>
            <input id="analysis-files-input" type="file" accept=".pdf" multiple onChange={handleAnalysisFilesChange} />
            {analysisFiles.length > 0 && renderFileList(analysisFiles)}
          </div>
        </div>
        <div className="actions">
          <button className="action-btn" onClick={handleAnalyze} disabled={!baseFile || analysisFiles.length === 0 || isLoading}>
            {isLoading ? t.analyzing : t.analyze_btn}
          </button>
        </div>
        
        {isLoading && (
          <div className="loader-container">
            <div className="loader"></div>
            <p>{loadingMessage}</p>
          </div>
        )}
        
        {error && <p className="error-message">{error}</p>}
        
        {generatedDoc && (
          <div className="results-section">
            <div className="results-header">
              <h2>{t.result_title}</h2>
              <button className="action-btn" onClick={handleSavePdf}>{t.save_pdf}</button>
            </div>
            <div id="generated-doc-container">
              <div id="generated-doc">
                <div dangerouslySetInnerHTML={{ __html: generatedDoc.replace(/\n/g, '<br />') }} />
                <div className="date-field">
                  <label htmlFor="location">{t.location_label}</label>
                  <input type="text" id="location" style={{width: '200px', padding: '8px'}} placeholder="São Paulo"/>,
                  <input type="date" id="effective-date" value={today} onChange={e => setToday(e.target.value)} />
                </div>
                <div className="signature">
                  <p>{t.signature}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
