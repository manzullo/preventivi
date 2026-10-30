import { BASE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// Loader JS: per ogni <div data-ma-form="slug"> crea un iframe verso
// /embed/{slug}/ inoltrando i parametri della pagina ospite (utm, gclid),
// ridimensiona in automatico e rilancia il lead nel dataLayer dell'ospite.
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const js = `(function(){
  var BASE=${JSON.stringify(BASE_URL)}, SLUG=${JSON.stringify(slug)};
  var cur=document.currentScript, client=(cur&&cur.getAttribute('data-client'))||'';
  var nodes=document.querySelectorAll('[data-ma-form="'+SLUG+'"]');
  var q=new URLSearchParams(window.location.search); if(client) q.set('client',client); q.set('parent',window.location.href);
  Array.prototype.forEach.call(nodes,function(el){
    if(el.getAttribute('data-ma-ready')) return; el.setAttribute('data-ma-ready','1');
    var f=document.createElement('iframe');
    f.src=BASE+'/embed/'+SLUG+'/?'+q.toString();
    f.style.cssText='width:100%;border:0;min-height:420px;display:block';
    f.setAttribute('title','Richiesta preventivo'); f.setAttribute('loading','lazy'); f.setAttribute('allow','autoplay');
    el.appendChild(f);
    window.addEventListener('message',function(ev){
      var d=ev.data||{}; if(ev.source!==f.contentWindow) return;
      if(d.type==='ma:height'&&d.height){ f.style.height=(d.height+8)+'px'; }
      if(d.type==='ma:lead'){ window.dataLayer=window.dataLayer||[]; window.dataLayer.push({event:'psf_form_submit',psf_form_id:SLUG,psf_lead_id:d.leadId,psf_client_id:client,psf_embed:true}); }
    });
  });
})();`;
  return new Response(js, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
