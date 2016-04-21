//Ensures there will be no 'console is undefined' errors
window.console = window.console || (function(){
    var c = {}; c.log = c.warn = c.debug = c.info = c.error = c.time = c.dir = c.profile = c.clear = c.exception = c.trace = c.assert = function(s){};
    return c;
})();

month_names_short = {'01':'Jan', '02':'Feb', '03':'Mar', '04':'Apr', '05':'May', '06':'Jun', '07':'Jul', '08':'Aug', '09':'Sep', '10':'Oct', '11':'Nov', '12':'Dec'};

var allStories;
var allMemberships;
var allLabels;
var minDataDate;
var maxDataDate;
var dateRanges;

function executeTrackerApiFetch() {
  
  // get parameters
  var token = $('#pivotal_token').val();
  var projectId = $('#project_id').val();

  localStorage.pivotalToken = token;
  localStorage.pivotalProjectId = projectId;

  var storiesFilters = '&filter=';
  storiesFilters += 'story_type:chore,feature,bug';
  console.log("Fetching data from Pivotal tracker...");
  $.when(
    // we can filter stories by state: '/stories?filter=state:delivered,finished,rejected,started,unstarted,unscheduled'
    // need to set limit to some big value (it's 100 by default)
    fetchData(projectId, '/stories?fields=id,name,current_state,label_ids,owner_ids,comments' + storiesFilters + '&limit=200', token), // '/stories?filter=state:delivered,finished,rejected,started,unstarted,unscheduled' '&limit=20'
    // get all people in the project
    fetchData(projectId, '/memberships', token),
    // get all labels in the project
    fetchData(projectId, '/labels', token)
  ).done(
    processResponses
  ).fail(function (jqXHR, textStatus) {
    alert("Can't fetch data");
  });

}

function processResponses(storiesResponse, membershipsResponse, labelsResponse) {
  console.log("Data is fetched.");
  allStories = storiesResponse[0];
  allMemberships = membershipsResponse[0];
  allLabels = labelsResponse[0];
  buildReport();
  updateDateRanges();
  $('#options_form').show();
  $('#actions_form').show();  
}

function buildReport() {

  var peopleById = {};
  for (var i=0; i < allMemberships.length; i++) {
    var membership = allMemberships[i];
    var person = membership.person;
    peopleById[person.id] = person;
  }

  var labelsById = {};
  for (var i = 0; i < allLabels.length; i++) {
    var label = allLabels[i];
    labelsById[label.id] = label;
  }

  var storiesByDate = {}; // storiesByDate[date]
  var storiesByPersonId = {}; // storiesByPerson[personId][date]
  var hoursByLabelId = {};
  var stories = [];
  var dataMinDate = '9999-99-99';
  var dataMaxDate = '0000-00-00';
  
  var html = '';
  for (var i = 0; i < allStories.length; i++) {
    
    var story = allStories[i];
    story.href = getStoryUrl(story.id);

    if (story.comments.length > 0) {
      var hoursByDate = {};
      var totalHours = 0;
      var hasSpent = false;
      for (var j = 0; j < story.comments.length; j ++) {
        var storySpents = [];
        var comment = story.comments[j];
        if (comment.text == undefined) {
          continue;
        }
        var matches = comment.text.match(/^(?:(\d\d\d\d-\d\d-\d\d)\s+)?spent\s+(\d+(?:\.\d+)?(?:h|m|d))(?:[\s\:]\s*(.+))?/);
        if (matches) {
          hasSpent = true;
          var date = comment.created_at.substring(0, 10);
          if (matches[1] != undefined) {
            date = matches[1];
          }
          if (date > dataMaxDate) {
            dataMaxDate = date;
          }
          if (date < dataMinDate) {
            dataMinDate = date;
          }
          var hours = parseFloat(matches[2].slice(0, -1));
          var unit = matches[2].slice(-1);
          if (unit == 'm') {
            hours = +(hours / 60).toFixed(1);
          } else if (unit == 'd') {
            hours = +(hours * 8).toFixed(1);
          }
          var message = matches[3];
          console.log(story.name + ': ' + date + ' ' + peopleById[comment.person_id].initials + ':' + hours);

          // sum comment hours to each tracked category
          totalHours += hours;
          for (var k = 0; k < story.label_ids.length; k ++) {
            var labelId = story.label_ids[k];
            sumValueByKey(hoursByLabelId, labelId, hours);
          }
          if (hoursByDate[date] == undefined) {
            hoursByDate[date] = {};
          }
          sumValueByKey(hoursByDate[date], comment.person_id, hours);
          addArrayElementByKey(storiesByDate, date, story);
          addArrayElementByKey(storiesByPersonId, comment.person_id, story);
        }
      }
      if (hasSpent) {
          story.totalHours = totalHours;
          story.hoursByDate = hoursByDate;
          stories.push(story);
      }
    }
    
    var owners = '';
    if (story.owner_ids.length > 0) {
      owners = [];
      for (var j = 0; j < story.owner_ids.length; j ++) {
        var person = peopleById[story.owner_ids[j]];
        owners.push(person.initials);
      }
      owners = ' (' + owners.join(", ") + ')';
    }
    story.owners = owners;

    var labels = '';
    if (story.label_ids.length > 0) {
      labels = [];
      for (var j = 0; j < story.label_ids.length; j ++) {
        var label = labelsById[story.label_ids[j]];
        labels.push('[' + label.name + ']');
      }
      labels = ' ' + labels.join(", ");
    }
    story.labels = labels;

  }

  minDataDate = new Date(dataMinDate);
  maxDataDate = new Date(dataMaxDate);

  var fromDate = new Date($('#date_from').val());
  if (isNaN(fromDate)) {
    fromDate = new Date(minDataDate);
    $('#date_from').val(dataMinDate);
  }

  var toDate = new Date($('#date_to').val());
  if (isNaN(toDate)) {
    toDate = new Date(maxDataDate);
    $('#date_to').val(dataMaxDate);
  }

  // list all dates from minDate to maxDate
  var allDates = [];
  while (fromDate <= toDate) {
    // todo: check if date is working day and store it somewhere
    allDates.push(fromDate.toISOString().slice(0, 10));
    fromDate = new Date(fromDate.setDate(fromDate.getDate() + 1));
  }

  html += '<tdbody>\n';

  var headerRows = drawTableHeaderRows(allDates);
  
  var passedLabelsById = undefined;
  if ($('#show_labels').is(':checked')) {
    passedLabelsById = labelsById;
  }

  html += '<tr><th class="titlerow" colspan="' + (allDates.length + 4) + '">All</th><tr>\n';
  html += headerRows;
  html += drawTableBodyRows(allDates, stories, storiesByDate, undefined, peopleById, passedLabelsById);
  html += drawTableFooterRow(allDates, storiesByDate, undefined, peopleById);

  var peopleIds = Object.keys(storiesByPersonId);
  for (var i = 0; i < peopleIds.length; i ++) {
    var personId = peopleIds[i];
    var personStories = storiesByPersonId[personId];
    html += '<tr><th class="titlerow" colspan="' + (allDates.length + 4) + '">' + peopleById[personId].name + '</th><tr>\n';
    html += headerRows;
    html += drawTableBodyRows(allDates, personStories, storiesByDate, personId, peopleById, passedLabelsById);
    html += drawTableFooterRow(allDates, storiesByDate, personId, peopleById);
  }

  html += '</tdbody>\n';
  $('#result_table').html(html);

  if ($('#show_labels').is(':checked')) {
    var sortedLabels = [];
    for (var labelId in hoursByLabelId) {
      var label = labelsById[labelId];
      var hours = hoursByLabelId[labelId];
      sortedLabels.push({name: label.name, hours: hours});
    }
    sortedLabels.sort(function(a, b) {return b.hours - a.hours});
    html = "<tbody>\n"
    html += '<tr><th class="titlerow" colspan="2">Hours spent by labels</th><tr>\n';
    html += '<tr><th>Label</th><th class="totalcolumn">Total</th><tr>\n';
    for (var i in sortedLabels) {
      var sortedLabel = sortedLabels[i];
      html += '<tr><td>' + sortedLabel.name + '</td><td class="totalcolumn">' + sortedLabel.hours + 'h</td></tr>';
    }
    html += '</tdbody>\n';
    $('#labels_table').html(html);
  } else {
    $('#labels_table').html('');
  }

  console.log("Done.");
}

function fetchData(projectId, resourcePath, token) {
  // compose request URL
  var url = 'https://www.pivotaltracker.com/services/v5';
  url += '/projects/' + projectId;
  url += resourcePath;
  return $.ajax({
    url: url,
    beforeSend: function(xhr) {
      xhr.setRequestHeader('X-TrackerToken', token);
    }
  });
}

function addArrayElementByKey(dict, key, element) {
  if (dict[key] == undefined) {
    dict[key] = [];
  }
  if (dict[key].indexOf(element) == -1) {
    dict[key].push(element);
  }
}

function sumValueByKey(dict, key, value) {
  if (dict[key] == undefined) {
    dict[key] = 0;
  }
  dict[key] += value;
}

function getStoryUrl(id) {
  return 'https://www.pivotaltracker.com/story/show/' + id;
}

function drawTableHeaderRows(allDates) {
  var html = '';
  var lastMonth = '';
  var months = '';
  var dayCount = 0;
  var days = '';
  for (var i = 0; i < allDates.length; i ++) {
    var date = allDates[i];
    var day = date.slice(-2);
    days += '<th class="daycolumn">' + day + '</th>';
    var month = month_names_short[date.substring(5, 7)];
    if (lastMonth == '') {
      lastMonth = month;
    } else if (month != lastMonth) {
      months += '<th colspan="' + dayCount + '">' + lastMonth + '</th>';
      lastMonth = month;
      dayCount = 0;
    }
    dayCount ++;
  }
  months += '<th colspan="' + dayCount + '">' + lastMonth + '</th>';
  html += '<tr><th rowspan="2">ID</th><th rowspan="2">Task</th><th rowspan="2">State</th>' + months + '<th rowspan="2">Total</th></tr>\n';
  html += '<tr>' + days + '</tr>\n';
  return html;
}

function drawTableBodyRows(allDates, stories, storiesByDate, targetPersonId, peopleById, labelsById) {
  html = '';
  for (var i = 0; i < stories.length; i ++) {
    var story = stories[i];
    htmlRow = '<tr><td><a href="' + story.href + '">' + story.id + '</a></td><td>' + story.name;
    if (labelsById != undefined) {
    var labels = [];
      for (var j in story.label_ids) {
        var labelId = story.label_ids[j];
        labels.push(labelsById[labelId].name);
      }
      htmlRow += '<div class="labels">' + labels.join(', ') + '</div>';
    }
    htmlRow += '</td><td class="statecell">' + story.current_state + '</td>';
    var storyTotalHours = 0;
    for (var j = 0; j < allDates.length; j ++) {
      var date = allDates[j];
      var totalHours = 0;
      var spentLabels = [];
      if (story.hoursByDate[date] != undefined) {
        var storyPeopleIds = Object.keys(story.hoursByDate[date]);
        for (var k = 0; k < storyPeopleIds.length; k ++) {
          var personId = storyPeopleIds[k];
          var person = peopleById[personId];
          var hours = story.hoursByDate[date][personId];
          if (targetPersonId == undefined || targetPersonId == personId) {
            totalHours += hours;
            storyTotalHours += hours;
          }
          spentLabels.push(person.initials + ':' + hours + 'h');
        }
      }
      if (totalHours > 0) {
        htmlRow += '<td class="daycolumn" title="' + spentLabels.join('\n') + '">' + totalHours + '</td>';
      } else {
        htmlRow += '<td class="daycolumn">&nbsp;</td>';
      }
    }
    if (storyTotalHours > 0) {
      htmlRow += '<td class="totalcolumn">' + storyTotalHours + 'h</td></tr>\n';
      html += htmlRow;
    }
  }
  return html;
}

function drawTableFooterRow(allDates, storiesByDate, targetPersonId, peopleById) {
  html = '<tr><th>Total</th><th>&nbsp;</th><th>&nbsp;</th>';
  var totalHours = 0;
  for (var i = 0; i < allDates.length; i ++) {
    var date = allDates[i];
    var dateStories = storiesByDate[date];
    if (dateStories == undefined) {
      html += '<th class="daycolumn">&nbsp;</th>';
      continue;
    }
    var dateHoursByPerson = {};
    var spentLabels = [];
    for (var j = 0; j < dateStories.length; j ++) {
      var story = dateStories[j];
      if (story.hoursByDate[date] == undefined) {
        continue;
      }
      var storyPeopleIds = Object.keys(story.hoursByDate[date]);
      for (var k = 0; k < storyPeopleIds.length; k ++) {
        var personId = storyPeopleIds[k];
        var hours = story.hoursByDate[date][personId];
        sumValueByKey(dateHoursByPerson, personId, hours);
      }
    }

    var dateHours = 0;
    var datePeopleIds = Object.keys(dateHoursByPerson);
    for (var j = 0; j < datePeopleIds.length; j ++) {
      var personId = datePeopleIds[j];
      var person = peopleById[personId];
      var hours = dateHoursByPerson[personId];
      if (targetPersonId == undefined || targetPersonId == personId) {
        dateHours += hours;
        totalHours += hours;
      }
      spentLabels.push(person.initials + ':' + hours + 'h');
    }

    var title = '';
    if (targetPersonId == undefined) {
      title = ' title="' + spentLabels.join('\n') + '"'
    }

    if (dateHours > 0) {
      html += '<th class="daycolumn"' + title + '>' + dateHours + '</th>';
    } else {
      html += '<th class="daycolumn">&nbsp;</th>';
    }
  }

  html += '<th class="totalcolumn">' + totalHours + 'h</th></tr>\n';
  return html;
}

function updateDateRanges() {
  dateRanges = {};
  var today = new Date();
  var toDate;
  var fromDate;
  var month;

  toDate = new Date(maxDataDate); 
  fromDate = new Date(minDataDate);
  dateRanges.all_range_btn = {from: fromDate, to: toDate};

  toDate = new Date(); 
  toDate.setDate(today.getDate() - 1);
  fromDate = new Date();
  fromDate.setDate(today.getDate() - 7);
  dateRanges.prev_7_days_range_btn = {from: fromDate, to: toDate};

  toDate = new Date();
  fromDate = new Date();
  month = toDate.toISOString().slice(5, 7);
  while (fromDate.toISOString().slice(5, 7) == month) {
    fromDate = new Date(fromDate.setDate(fromDate.getDate() - 1));
  }
  fromDate = new Date(fromDate.setDate(fromDate.getDate() + 1));
  dateRanges.current_month_range_btn = {from: fromDate, to: toDate};
  
  toDate = new Date();
  fromDate = new Date();
  month = toDate.toISOString().slice(5, 7);
  while (fromDate.toISOString().slice(5, 7) == month && fromDate >= minDataDate) {
    fromDate = new Date(fromDate.setDate(fromDate.getDate() - 1));
  }
  if (fromDate >= minDataDate) {
    toDate = new Date(fromDate);
    month = toDate.toISOString().slice(5, 7);
    while (fromDate.toISOString().slice(5, 7) == month && fromDate >= minDataDate) {
      fromDate = new Date(fromDate.setDate(fromDate.getDate() - 1));
    }
    fromDate = new Date(fromDate.setDate(fromDate.getDate() + 1));
    dateRanges.prev_month_range_btn = {from: fromDate, to: toDate};
    $('#prev_month_range_btn').attr('disabled', false);
  } else {
    // there is no data for prev month
    $('#prev_month_range_btn').attr('disabled', true);
  }

}

$(function() {
  $('#options_form').hide();

  $('#fetch_data_form').submit(function(event) {
    event.preventDefault();
    executeTrackerApiFetch();
  });

  $('#options_form').submit(function(event) {
    event.preventDefault();
    buildReport();
  });

  $('.range_btn').click(function(event) {
      var range = dateRanges[this.id];
      $('#date_from').val(range.from.toISOString().slice(0, 10));
      $('#date_to').val(range.to.toISOString().slice(0, 10));
      buildReport();
  });

  if (localStorage.pivotalToken != undefined) {
    $('#pivotal_token').val(localStorage.pivotalToken);
  }
  if (localStorage.pivotalProjectId) {
    $('#project_id').val(localStorage.pivotalProjectId);
  }
});
