export const methodText =
  "Attention Routing combines relevant features using learned attention weights. The method preserves residual information and reduces unnecessary feature mixing during training.";
export const htmlPaper = `<!doctype html><html><body><article class="ltx_document">
<h1>Controlled Reader Paper</h1>
<section class="ltx_section" id="S1"><h2>1 Introduction</h2><div class="ltx_para" id="S1.p1"><p>This paper studies efficient representations and compares different ways to combine evidence for a controlled reading experiment.</p></div></section>
<section class="ltx_section" id="S2"><h2>2 Method</h2><div class="ltx_para" id="S2.p1"><p>${methodText}</p></div>
<div class="ltx_para" id="S2.p2"><p>The normalization step retains the relative scale of the original features. <strong>Attention Routing</strong> is evaluated under the same training budget.</p></div>
<div class="ltx_equation" id="E1"><math display="block"><mrow><mi>y</mi><mo>=</mo><mfrac><mi>x</mi><mi>n</mi></mfrac></mrow><annotation encoding="application/x-tex">y=x/n</annotation></math></div>
<table id="T1"><tr><th>Method</th><th>Accuracy</th></tr><tr><td>Attention Routing</td><td>91.2</td></tr></table>
<figure id="F1"><img src="x1.png" alt="Feature diagram"><figcaption>Figure 1: the attention pathway.</figcaption></figure></section>
<section class="ltx_section" id="S3"><h2>3 Limitations</h2><p>The limitations include sensitivity to dataset shifts and increased memory usage. Experiments on out-of-domain data reveal failure cases requiring further evaluation.</p></section>
<script>window.readerInjected=true</script><p><a href="javascript:alert(1)">Unsafe link</a><img src="https://example.invalid/track.png" onerror="window.readerInjected=true" alt="External image"></p>
</article></body></html>`;
