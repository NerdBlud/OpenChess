const paths={
 first:'<path d="M5 5v14m14-14-9 7 9 7"/>',
 prev:'<path d="m15 5-7 7 7 7"/>',
 next:'<path d="m9 5 7 7-7 7"/>',
 last:'<path d="M19 5v14M5 5l9 7-9 7"/>',
 flip:'<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>',
 autoplay:'<path d="m8 5 12 7-12 7z"/>',
 sound:'<path d="M11 5 6 9H3v6h3l5 4zM15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
 review:'<path d="M3 17h6m-3-3v6m7-15h8m-4-4v8m-3 4h6m-3-3v6"/>',
 budget:'<path d="m7 10 5 5 5-5"/>',
 line:'<path d="M4 5v8a6 6 0 0 0 6 6h9m-4-4 4 4-4 4M4 5h13m-4-4 4 4-4 4"/>',
 retry:'<path d="M5 10a8 8 0 1 1 0 5M5 4v6h6"/>',
 load:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>'
};

export function decorateControl(button,name){
 const label=document.createElement('span');
 label.className='control-label';
 label.append(...button.childNodes);
 button.insertAdjacentHTML('afterbegin',`<svg viewBox="0 0 24 24" class="review-icon" aria-hidden="true">${paths[name]}</svg>`);
 button.append(label);
 return label;
}
