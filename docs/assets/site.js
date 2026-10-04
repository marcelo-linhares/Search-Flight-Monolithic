(function(){var l='en';try{l=localStorage.getItem('sf-lang')||((navigator.language||'en').slice(0,2)==='pt'?'pt':'en')}catch(e){l=((navigator.language||'en').slice(0,2)==='pt')?'pt':'en'}
function set(x){document.documentElement.lang=x;document.querySelectorAll('.lang').forEach(function(b){b.textContent=x==='pt'?'PT ⇄ EN':'EN ⇄ PT'});try{localStorage.setItem('sf-lang',x)}catch(e){}}
set(l);document.addEventListener('click',function(e){if(e.target.classList.contains('lang')){set(document.documentElement.lang==='pt'?'en':'pt')}})})();
