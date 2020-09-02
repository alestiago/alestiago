$(function(){
  function openURL($object, url) {
    $object.click(function(){
      window.open(url, '_blank').focus();
    })
  }

  openURL($('#twitter'), 'https://twitter.com/alestiago3');
  openURL($('#github'), 'https://github.com/alestiago');
  openURL($('#linkedin'), 'https://www.linkedin.com/in/alejandro-santiago-44259b159/');
});