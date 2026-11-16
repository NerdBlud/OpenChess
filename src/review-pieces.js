const shapes={
 p:'<circle cx="24" cy="12" r="6"/><path d="M20 18h8l-1 8 5 8H16l5-8zM14 35h20l2 6H12z"/>',
 r:'<path d="M12 6h6v6h4V6h4v6h4V6h6v13l-5 3v11H17V22l-5-3zM14 34h20l3 7H11z"/><path class="detail" d="M17 22h14M17 30h14"/>',
 b:'<path d="M24 4c-3 5-11 9-11 16 0 5 4 8 8 9l-5 5h16l-5-5c4-1 8-4 8-9 0-7-8-11-11-16zM14 35h20l3 6H11z"/><path class="detail" d="m26 10-6 12"/>',
 n:'<path d="m15 6 6 3 7-4-1 6c10 4 11 13 8 23H16l5-10-7 2-6-5 8-10zM14 35h21l2 6H11z"/><path class="detail" d="m16 20 5-3M27 15c5 5 4 11 1 16"/><circle class="eye" cx="23" cy="14" r="1.2"/>',
 q:'<path d="m10 14 5 18h18l5-18-9 8-5-11-5 11zM14 33h20l3 8H11z"/><circle cx="9" cy="11" r="3"/><circle cx="24" cy="7" r="3"/><circle cx="39" cy="11" r="3"/><path class="detail" d="M16 28h16"/>',
 k:'<path d="M22 3h4v5h5v4h-5v5h-4v-5h-5V8h5zM24 19c-9-10-20 1-12 9l5 5h14l5-5c8-8-3-19-12-9zM15 34h18l4 7H11z"/><path class="detail" d="M24 19v12"/>'
};
export function pieceSvg(type){
 return `<svg class="piece" viewBox="0 0 48 48" aria-hidden="true">${shapes[type]}</svg>`;
}
