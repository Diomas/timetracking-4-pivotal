# timetracking-4-pivotal
Build spent time reports for Pivotal Tracker

![Screenshot](docs/screenshot.jpg "screenshot")

This utility gets all stories from the project and iterate over each comment to find comments that are recognized as time spent records. Then it builds a spreadsheet with a summarized data.

## Recognized `spent` comment patterns:

### Short record
`spent 2h`

Tells that 2 hours were spent by commenter for the story in the same day as the comment was added.

### Certain date
`2016-03-29 spent 2h`

Tells that 2 hours were spent by commenter for the story in the given date

### Other time units
`spent 30m`

The same as `spent 0.5h`. Also `d` is supported (for whatever reason).

### Comment
`spent 1.5h: reading the spec`