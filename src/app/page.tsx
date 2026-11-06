"use client";

import { useEffect, useRef, useState } from "react";
import { validateInputs, validateUpload } from "@/lib/validation";
import { buildStoryboard, readCaptions, type Analysis, type Storyboard } from "@/lib/format";
import { upload } from "@vercel/blob/client";

const steps = ["Reading the reference timing…", "Planning the three scenes…", "Preparing your screenshots…", "Rendering the hook…", "Rendering the walkthrough…", "Rendering the payoff…", "Exporting your MP4…"];
const sceneNames = ["Hook", "Walkthrough", "Payoff"];
const sampleDescription = "An outfit planner that picks clothes for your calendar and generates a virtual try-on.";

function Icon({ name, size = 20 }: { name: "fork" | "upload" | "arrow" | "play" | "check" | "download"; size?: number }) {
  const paths = { fork: <><path d="M6 3v7a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v3M18 3v3a4 4 0 0 1-4 4h-4"/><circle cx="6" cy="3" r="2"/><circle cx="18" cy="3" r="2"/><circle cx="18" cy="21" r="2"/></>, upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>, arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>, play: <path d="m9 5 11 7-11 7Z"/>, check: <path d="m5 12 4 4L19 6"/>, download: <><path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/></> };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Upload({ label, kind, file, onChange, disabled, index }: { label: string; kind: "reference" | "image"; file: File | null; onChange: (file: File) => void; disabled: boolean; index?: number }) {
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => { if (!file) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  return <label className={`upload ${kind === "image" ? "image-upload" : "reference-upload"} ${file ? "has-file" : ""} ${dragging ? "dragging" : ""} ${disabled ? "disabled" : ""}`} onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled && e.dataTransfer.files[0]) onChange(e.dataTransfer.files[0]); }}>
    <input type="file" aria-label={label} accept={kind === "reference" ? ".mp4,.mov,video/mp4,video/quicktime" : ".jpg,.jpeg,.png,image/jpeg,image/png"} disabled={disabled} onChange={e => { if (e.target.files?.[0]) onChange(e.target.files[0]); e.target.value = ""; }}/>
    {preview ? <>{kind === "reference" ? <video src={preview} controls playsInline onClick={e => e.preventDefault()}/> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={preview} alt={label}/>}<span className="file-tag"><Icon name="check" size={13}/><span>{file?.name}</span></span></> : kind === "reference" ? <><span className="upload-icon"><Icon name="upload" size={22}/></span><strong>Drop a demo whose <em>FORMAT</em> you like.</strong><span>or <b>browse files</b></span><small>MP4 or MOV · up to 30 sec · max 40 MB</small></> : <><span className="image-plus">+</span><strong>{label}</strong><small>{["The hook", "How it works", "The payoff"][index ?? 0]}</small></>}
  </label>;
}

export default function Home() {
  const [reference, setReference] = useState<File | null>(null);
  const [images, setImages] = useState<(File | null)[]>([null, null, null]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [customCaptions, setCustomCaptions] = useState<string[] | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(-1);
  const [status, setStatus] = useState("");
  const [sceneStatus, setSceneStatus] = useState<string[]>(["pending", "pending", "pending"]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [video, setVideo] = useState("");
  const [outputDuration, setOutputDuration] = useState(0);
  const [motion, setMotion] = useState("screenshot");
  const lock = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const outputUrl = useRef("");
  const outputPanel = useRef<HTMLElement>(null);
  useEffect(() => () => { abort.current?.abort(); if (outputUrl.current) URL.revokeObjectURL(outputUrl.current); }, []);
  useEffect(() => {
    if ((busy || video) && window.matchMedia("(max-width: 680px)").matches) {
      outputPanel.current?.scrollIntoView({ block: "start" });
    }
  }, [busy, video]);

  const captions = customCaptions ?? buildStoryboard(name, description).scenes.map(scene => scene.caption);

  async function loadExample() {
    setSampleLoading(true);
    setError("");
    try {
      const sampleFile = async (filename: string, type: string) => {
        const response = await fetch(`/sample/${filename}`);
        if (!response.ok) throw new Error("Couldn’t load the example. Try again.");
        return new File([await response.blob()], filename, { type });
      };
      const [clip, ...screens] = await Promise.all([
        sampleFile("demo.mp4", "video/mp4"),
        ...[0, 1, 2].map(i => sampleFile(`screenshot-${i}.png`, "image/png")),
      ]);
      setReference(clip);
      setImages(screens);
      setName("Wardrobe");
      setDescription(sampleDescription);
      setCustomCaptions(null);
      document.getElementById("product-name")?.focus();
    } catch {
      setError("Couldn’t load the example. Try again.");
    } finally {
      setSampleLoading(false);
    }
  }

  function pickScreenshots(files: File[]) {
    try {
      if (files.length !== 3) throw new Error("Choose exactly three screenshots, in story order.");
      files.forEach(file => validateUpload(file, "image"));
      setImages(files);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  }

  function pick(file: File, kind: "reference" | "image", index = 0) {
    try { validateUpload(file, kind); setError(""); if (kind === "reference") setReference(file); else setImages(old => old.map((item, i) => i === index ? file : item)); } catch (err) { setError((err as Error).message); }
  }
  function reset() {
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
    outputUrl.current = ""; setVideo(""); setAnalysis(null); setStoryboard(null); setStage(-1); setError(""); setReference(null); setImages([null, null, null]); setName(""); setDescription(""); setCustomCaptions(null);
  }
  async function generate(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return;
    setError("");
    try {
      validateInputs(reference, images, name, description);
      readCaptions(captions);
    } catch (err) { setError((err as Error).message); return; }
    lock.current = true; setBusy(true); setStage(0); setStatus(steps[0]); setSceneStatus(["pending", "pending", "pending"]); setAnalysis(null); setStoryboard(null); setVideo("");
    if (outputUrl.current) URL.revokeObjectURL(outputUrl.current);
    abort.current = new AbortController();
    const staged: string[] = [];
    try {
      const configResponse = await fetch("/api/config", { cache: "no-store", signal: abort.current.signal });
      if (!configResponse.ok) throw new Error("Couldn’t connect to the server. Refresh and try again.");
      const config = await configResponse.json();
      if (!config.configured) throw new Error("Uploads are temporarily unavailable. Try again later.");
      let body: FormData | string;
      let headers: Record<string, string> = {};
      if (config.uploadMode === "blob") {
        const session = crypto.randomUUID();
        const files = [reference!, ...images as File[]];
        for (let i = 0; i < files.length; i++) {
          setStatus(i === 0 ? "Uploading your reference..." : `Uploading screenshot ${i}...`);
          const extension = files[i].name.split(".").pop()!.toLowerCase();
          const pathname = `demofork/${session}/${i === 0 ? "reference" : `screenshot-${i - 1}`}.${extension}`;
          const contentType = i === 0 ? extension === "mov" ? "video/quicktime" : "video/mp4" : extension === "png" ? "image/png" : "image/jpeg";
          // Upload directly to private Blob storage; large files never traverse a Vercel Function request.
          staged.push(pathname);
          await upload(pathname, files[i], { access: "private", handleUploadUrl: "/api/upload", contentType, abortSignal: abort.current.signal });
        }
        body = JSON.stringify({ paths: staged, productName: name, description, captions });
        headers = { "Content-Type": "application/json" };
      } else {
        if (config.hosted) throw new Error("Connect a private Vercel Blob store and redeploy to enable uploads.");
        const form = new FormData();
        form.append("reference", reference!);
        form.append("productName", name);
        form.append("description", description);
        images.forEach(file => form.append("screenshots", file!));
        captions.forEach(caption => form.append("captions", caption));
        body = form;
      }
      setStatus(steps[0]);
      const response = await fetch("/api/generate", { method: "POST", body, headers, signal: abort.current.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Couldn’t start generation (HTTP ${response.status}). Check the deployment setup.`);
      }
      if (!response.body) throw new Error("Couldn’t connect to the video builder.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let completed = false;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "progress") { setStage(event.stage); setStatus(event.message); }
          if (event.type === "scene") setSceneStatus(old => old.map((value, i) => i === event.index ? event.status : value));
          if (event.type === "analysis") setAnalysis(event.analysis);
          if (event.type === "storyboard") setStoryboard(event.storyboard);
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "complete") {
            const bytes = Uint8Array.from(atob(event.video), c => c.charCodeAt(0));
            outputUrl.current = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
            setVideo(outputUrl.current); setOutputDuration(event.durationSeconds); setMotion(event.motion); setStage(7); completed = true;
          }
        }
      }
      if (!completed) throw new Error("The connection dropped before your video was ready. Your inputs are still here. Try again.");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Try again."); }
    finally {
      if (staged.length) void fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "cleanup", paths: staged }), keepalive: true }).catch(() => {});
      setBusy(false); lock.current = false;
    }
  }

  const count = images.filter(Boolean).length;
  const disabled = busy || sampleLoading;
  const missing = !reference ? "Add a reference video to start."
    : !name.trim() || !description.trim() ? "Add your product name and description."
    : count < 3 ? `Add ${3 - count} more screenshot${count === 2 ? "" : "s"}.`
    : "Your inputs are ready.";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="DemoFork home">
          <span className="brand-icon"><Icon name="fork" size={21}/></span>DemoFork<span className="beta">BETA</span>
        </a>
        <span className="header-note"><span className="live-dot"/>REFERENCE → ORIGINAL DEMO</span>
      </header>
      <main>
        <section className="intro">
          <div className="eyebrow"><span/> THE PRODUCT DEMO BUILDER</div>
          <h1>Steal the format.<br/><span>Not the content.</span></h1>
          <p>Turn a reference and three screenshots into a short launch video.</p>
        </section>
        <div className="workspace">
          <form onSubmit={generate} className="input-panel">
            <section className="form-section">
              <div className="section-heading">
                <span className="step-number">01</span><h2>Reference video</h2>
                <button className="text-button" type="button" disabled={disabled} onClick={loadExample}>
                  {sampleLoading ? "Loading example…" : "Load example"}
                </button>
              </div>
              <Upload kind="reference" label="Reference demo" file={reference} disabled={disabled} onChange={file => pick(file, "reference")}/>
              <p className="input-note">DemoFork uses the reference to plan the pace of your edit.</p>
            </section>
            <section className="form-section product-section">
              <div className="section-heading"><span className="step-number">02</span><h2>Your product</h2></div>
              <label className="field-label" htmlFor="product-name">Product name</label>
              <input id="product-name" className="text-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wardrobe" maxLength={80} disabled={disabled}/>
              <label className="field-label description-label" htmlFor="description">What does your product do?</label>
              <textarea id="description" className="text-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Plan outfits around your calendar and preview each look." maxLength={1200} rows={2} disabled={disabled}/>
              <div className="screenshots-heading">
                <span>Product screenshots <small>{count}/3</small></span>
                <label className="text-button batch-picker">
                  Add all three
                  <input type="file" aria-label="Add all three screenshots" multiple accept=".jpg,.jpeg,.png,image/jpeg,image/png" disabled={disabled}
                    onChange={e => { if (e.target.files?.length) pickScreenshots(Array.from(e.target.files)); e.target.value = ""; }}/>
                </label>
              </div>
              <div className="image-grid">
                {images.map((file, i) => <Upload key={i} kind="image" label={`Screenshot ${i + 1}`} index={i} file={file} onChange={next => pick(next, "image", i)} disabled={disabled}/>)}
              </div>
              <p className="input-note">JPG or PNG · 8 MB each · pick in story order. Tap a thumbnail to replace it.</p>
              <details className="caption-editor">
                <summary>Edit captions <span>Optional · 10 words per scene</span></summary>
                {captions.map((caption, i) => (
                  <label className="field-label" key={sceneNames[i]}>
                    {sceneNames[i]}
                    <input className="text-input" value={caption} maxLength={90} disabled={disabled}
                      onChange={e => { const value = e.target.value; setCustomCaptions(captions.map((item, index) => index === i ? value : item)); }}/>
                  </label>
                ))}
                {customCaptions && <button className="text-button" type="button" onClick={() => setCustomCaptions(null)} disabled={disabled}>Reset suggested captions</button>}
              </details>
            </section>
            <div className="generate-section">
              <div className="section-heading"><span className="step-number">03</span><h2>Make the cut</h2></div>
              {error && <div className="error" role="alert">{error}</div>}
              <button className="primary-button generate-button" type="submit" disabled={disabled}>
                {busy ? <><span className="spinner"/> BUILDING YOUR DEMO</> : <>GENERATE DEMO <Icon name="arrow" size={19}/></>}
              </button>
              <p className="generate-note">{busy ? "Keep this page open while the video renders." : missing}</p>
            </div>
          </form>
          <aside ref={outputPanel} className={`output-panel ${video ? "is-ready" : ""}`} aria-label="Video output" aria-busy={busy}>
            <div className="output-topline">
              <span><span className={busy ? "live-dot pulse" : "tiny-square"}/>{video ? "YOUR DEMO" : busy ? "RENDERING" : "EXAMPLE OUTPUT"}</span>
              <small>{video ? `${outputDuration.toFixed(1)} SEC / MP4` : "3 SCENES / MP4"}</small>
            </div>
            {video ? (
              <div className="result">
                <h2>Your demo is ready.</h2>
                <video className="result-video" src={video} controls playsInline autoPlay muted aria-label="Generated product demo"/>
                <a className="primary-button download" href={video} download="final-demo.mp4"><Icon name="download" size={17}/> DOWNLOAD MP4</a>
                <p className="motion-credit">{motion === "magic-hour" ? "Motion generated with Magic Hour" : "Animated from your original screenshots"}</p>
                <div className="format-card">
                  <span className="mini-label">REFERENCE FORMAT</span>
                  <div className="format-stats"><span>Pacing <b>{analysis?.pacing}</b></span><span>Duration <b>{analysis?.durationSeconds.toFixed(1)} seconds</b></span></div>
                  <div className="structure">Hook <span>→</span> Walkthrough <span>→</span> Payoff</div>
                </div>
                <span className="mini-label version-label">SCENE CAPTIONS</span>
                <ol className="caption-list">{storyboard?.scenes.map((scene, i) => <li key={i}><span>0{i + 1}</span>{scene.caption}</li>)}</ol>
                <button className="reset-button" onClick={reset} disabled={busy}>START OVER <span>↻</span></button>
              </div>
            ) : busy || analysis ? (
              <div className="progress-content" role="status" aria-live="polite">
                <div className="progress-mark"><Icon name="fork" size={30}/>{busy && <span/>}</div>
                <h2>{error ? "The render stopped." : "Building your demo."}</h2>
                <p>{error ? "Your inputs are still here. Check the message by the Generate button." : "Keep this page open while the video renders."}</p>
                <ol className="progress-list">
                  {steps.map((step, i) => {
                    const scene = i >= 3 && i <= 5 ? sceneStatus[i - 3] : null;
                    const done = i < stage || scene === "complete";
                    const current = !done && (scene === "running" || i === stage);
                    return <li key={step} className={done ? "done" : current ? "current" : ""}>
                      <span>{done ? <Icon name="check" size={13}/> : current && busy ? <span className="spinner"/> : String(i + 1).padStart(2, "0")}</span>
                      {i === stage && stage !== 3 ? status : step}
                    </li>;
                  })}
                </ol>
              </div>
            ) : (
              <div className="sample-preview">
                <video className="result-video" src="/sample/demo.mp4" poster="/sample/poster.jpg" controls playsInline preload="none" aria-label="Example product demo"/>
                <h2>See what the cut looks like.</h2>
                <p>Watch a finished demo or load the example to try the full flow.</p>
                <button className="sample-button" type="button" disabled={disabled} onClick={loadExample}>
                  {sampleLoading ? "Loading example…" : "Load this example"} <Icon name="arrow" size={16}/>
                </button>
              </div>
            )}
            <div className="output-footer"><span className="privacy-mark">◇</span><p>Three scenes built from your own product screenshots.</p></div>
          </aside>
        </div>
        <footer className="page-footer"><span>DEMOFORK</span><span>Reference in. Launch video out.</span></footer>
      </main>
    </div>
  );
}
