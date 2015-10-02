import $ from 'jquery';


const separator = (response) => {
	if (response) { console.log('   ', response) }
	console.log('--------------------------------------------------------------------------------');
};


const rest = (method, url, data) => {
	return new Promise((resolve, reject) => {
		$.ajax({
			method:      method,
			url:         `//localhost:3000${url}`,
			data:        data ? JSON.stringify(data) : undefined,
			contentType: 'application/json',
			dataType:    'json', // type of data expected back from the server
			processData: false
		}).done(resolve).fail((errXhr) => { reject($.parseJSON(errXhr.responseText)) })
	}).then((response) => {
		console.log(method, url, data);
		return response;
	}, (err) => {
		console.log(method, url, data);
		throw err;
	});
};


//Promise.all([
//	rest('POST', '/lyphTemplates', { name: 'bar' }),
//	rest('POST', '/lyphs',         { name: 'foo' })
//]).then(([[lyphTemplate], [lyph]]) => {
//	console.log(lyphTemplate, lyph);
//});


//rest('POST', '/lyphs', { name: 'foo', template: 0 }).then((response) => {
//	console.log('OK:', response);
//});


rest('DELETE', '/lyphTemplates/4/layers/1').then((response) => {
	console.log('    OK:', response);
}, (err) => {
	console.log('    ERROR:', err);
});



