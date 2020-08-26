# Custom filters for jinja (Home Assistant)

## Installation
Place the `custom_filters` folder into your `custom_components` folder.
Add "custom_filters:" to your configuration.yaml.

## Filters
<p>

```
unquote                     - replace %xx escapes by their single-character equivalent.
urldecode                   - alias for `unqoute`
ternary                     - to use one value on true, one value on false and a third value on null
shuffle                     - randomize an existing list, giving a different order every invocation
deflate                     - zlib decompress
inflate                     - zlib compress
decode_base64_and_inflate   - decode base64 content and decompress it
deflate_and_base64_encode   - compress content and base64 encode it
```

</p>
